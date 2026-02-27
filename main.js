(() => {
  // State management
  const state = {
    filters: {
      routes: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
      selectedRoutes: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
    },
    settings: {
      autoRefresh: true,
      refreshInterval: 7000,
      currentBusIcon: "bus1.png",
    },
    currentMarkers: null,
    isFetching: false,
    refreshIntervalId: null,
    busIcon: null,
  };

  // Initialize map
  let map = L.map("theMap").setView([44.650627, -63.59714], 14);

  // Base layers
  const baseLayers = {
    "Street Map": L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }
    ),
    // https://stackoverflow.com/questions/9394190/leaflet-map-api-with-google-satellite-layer
    Satellite: L.tileLayer(
      "https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
      {
        maxZoom: 20,
        subdomains: ["mt0", "mt1", "mt2", "mt3"],
        attribution: "&copy; Google",
      }
    ),
    // https://docs.stadiamaps.com/map-styles/alidade-smooth-dark/
    "Dark Mode": L.tileLayer(
      "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png",
      {
        maxZoom: 20,
        attribution:
          '&copy; <a href="https://stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
      }
    ),
  };

  // Add default layer
  baseLayers["Street Map"].addTo(map);

  // Add layer control
  L.control.layers(baseLayers).addTo(map);

  // Layer groups
  state.currentMarkers = L.layerGroup().addTo(map);

  // Initialize bus icon
  const initializeBusIcon = (iconUrl = "bus1.png") => {
    state.settings.currentBusIcon = iconUrl;
    state.busIcon = L.icon({
      iconUrl: iconUrl,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -16],
    });
  };

  // Change bus icon function
  window.changeBusIcon = (iconUrl) => {
    initializeBusIcon(iconUrl);
    // Refresh the map with new icons
    fetchBusData();
  };

  // Initialize UI
  const initializeUI = () => {
    // Create route checkboxes
    const routeFiltersContainer = document.getElementById("route-filters");
    state.filters.routes.forEach((route) => {
      const checkbox = document.createElement("div");
      checkbox.innerHTML = `
        <label style="display: flex; align-items: center; gap: 5px; font-weight: normal;">
          <input type="checkbox" value="${route}" checked 
            onchange="updateRouteFilter('${route}', this.checked)">
          Route ${route}
        </label>
      `;
      routeFiltersContainer.appendChild(checkbox);
    });

    // Set initial bus icon in dropdown
    document.getElementById("bus-icon-select").value =
      state.settings.currentBusIcon;
  };

  // Update route filter
  window.updateRouteFilter = (route, isSelected) => {
    if (isSelected) {
      if (!state.filters.selectedRoutes.includes(route)) {
        state.filters.selectedRoutes.push(route);
      }
    } else {
      state.filters.selectedRoutes = state.filters.selectedRoutes.filter(
        (r) => r !== route
      );
    }
    // Refresh map with new filters
    fetchBusData();
  };

  // Toggle all routes
  window.toggleAllRoutes = (selectAll) => {
    const checkboxes = document.querySelectorAll(
      '#route-filters input[type="checkbox"]'
    );
    checkboxes.forEach((checkbox) => {
      checkbox.checked = selectAll;
      window.updateRouteFilter(checkbox.value, selectAll);
    });
  };

  // Toggle auto refresh
  window.toggleAutoRefresh = () => {
    state.settings.autoRefresh = !state.settings.autoRefresh;
    const statusElement = document.getElementById("refresh-status");

    if (state.settings.autoRefresh) {
      statusElement.textContent = "ON";
      statusElement.style.color = "green";
      startAutoRefresh();
    } else {
      statusElement.textContent = "OFF";
      statusElement.style.color = "red";
      stopAutoRefresh();
    }
  };

  // Auto-refresh control
  const startAutoRefresh = () => {
    if (state.refreshIntervalId) {
      clearInterval(state.refreshIntervalId);
    }
    state.refreshIntervalId = setInterval(() => {
      if (!state.isFetching) {
        fetchBusData();
      }
    }, state.settings.refreshInterval);
  };

  const stopAutoRefresh = () => {
    if (state.refreshIntervalId) {
      clearInterval(state.refreshIntervalId);
      state.refreshIntervalId = null;
    }
  };

  // Function to fetch bus data
  const fetchBusData = async () => {
    if (state.isFetching) return;

    state.isFetching = true;
    try {
      const response = await fetch(
        "https://halifax-transit-data.onrender.com/vehicles"
      );
      const rawData = await response.json();

      console.log("Raw API Data:", rawData);

      // Extract vehicles from entity array and filter based on selected routes
      const filteredBuses = rawData.entity
        .map((entity) => entity.vehicle)
        .filter((vehicle) => {
          const routeId = vehicle.trip.routeId;
          // Extract numeric part from routeId (e.g., "1", "2", "7A" -> 1, 2, 7)
          const routeNumber = routeId.replace(/[^0-9]/g, "");
          return state.filters.selectedRoutes.includes(routeNumber);
        });

      console.log("Filtered Bus Data:", filteredBuses);

      // Convert to GeoJSON
      const geoJsonData = {
        type: "FeatureCollection",
        features: filteredBuses.map((vehicle) => ({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [
              vehicle.position.longitude,
              vehicle.position.latitude,
            ],
          },
          properties: {
            id: vehicle.vehicle.id,
            label: vehicle.vehicle.label,
            route: vehicle.trip.routeId,
            bearing: vehicle.position.bearing || 0,
            trip_id: vehicle.trip.tripId,
            direction: vehicle.trip.directionId === 0 ? "Outbound" : "Inbound",
            speed: vehicle.position.speed,
            timestamp: vehicle.timestamp,
            occupancy: vehicle.occupancyStatus,
          },
        })),
      };

      console.log("GeoJSON Data:", geoJsonData);

      // Update map with new data
      updateMap(geoJsonData);
    } catch (error) {
      console.error("Error fetching bus data:", error);
    } finally {
      state.isFetching = false;
    }
  };

  // Function to update map with GeoJSON data
  const updateMap = (geoJsonData) => {
    // Clear existing markers
    state.currentMarkers.clearLayers();

    // Add new markers
    L.geoJSON(geoJsonData, {
      pointToLayer: (feature, latlng) => {
        return L.marker(latlng, {
          icon: state.busIcon,
          rotationAngle: feature.properties.bearing,
          rotationOrigin: "center",
        });
      },
      onEachFeature: (feature, layer) => {
        const props = feature.properties;
        const popupContent = `
          <div style="font-family: Arial, sans-serif; padding: 8px; min-width: 200px;">
            <h3 style="margin: 0 0 8px 0; color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 4px;">
              🚌 Bus ${props.label}
            </h3>
            <p style="margin: 4px 0;"><strong>Route:</strong>
              ${props.route}
            </p>
            <p style="margin: 4px 0;"><strong>Vehicle ID:</strong>
              ${props.id}
            </p>
            <p style="margin: 4px 0;"><strong>Direction:</strong>
              ${props.direction}
            </p>
            <p style="margin: 4px 0;"><strong>Heading:</strong>
              ${props.bearing}°
            </p>
            <p style="margin: 4px 0;"><strong>Speed:</strong>
              ${(props.speed * 3.6).toFixed(1)}km/h
            </p>
            <p style="margin: 4px 0;"><strong>Occupancy:</strong>
              ${props.occupancy.replace(/_/g, " ").toLowerCase()}
            </p>
            <p style="margin: 4px 0;"><strong>Last Updated:</strong>
              ${new Date(props.timestamp * 1000).toLocaleTimeString()}
            </p>
          </div>
        `;
        layer.bindPopup(popupContent);

        // Add touch-friendly events for mobile
        layer.on("click", function (e) {
          this.openPopup();
        });
      },
    }).addTo(state.currentMarkers);
  };

  // Initialize application
  const init = () => {
    // Initialize bus icon first
    initializeBusIcon();

    // Then initialize UI and start
    initializeUI();
    fetchBusData();
    startAutoRefresh();

    // Add responsive event listeners
    window.addEventListener("resize", () => {
      map.invalidateSize();
    });
  };

  // Start the application
  init();
})();
