// Define EPSG:32633 using proj4.defs
proj4.defs("EPSG:32633", "+proj=utm +zone=33 +datum=WGS84 +units=m +no_defs");

let isDeleteModeActive = false;
var previousSelectedLayer = null;

// Hide the style menu initially
document.getElementById('style-controls').style.display = 'none';
document.getElementById('area').style.display = 'none';
document.getElementById('copy-bbox-coordinates').style.display = 'none';

// Initialize the map on Rapperswil SG, Switzerland
var map = L.map('map').setView([47.2265, 8.8184], 11);

// Initialize empty history
var historyList = document.getElementById('history-list');
var showHistoryButton = document.getElementById('show-history');
var clearHistoryButton = document.getElementById('clear-history');
var closeHistoryButton = document.getElementById('close-history');

map.on('draw:editstart', function() {
    isDeleteModeActive = true;
});

map.on('draw:editstop', function() {
    isDeleteModeActive = false;
});

map.on('draw:deletestart', function() {
    isDeleteModeActive = true;
});

map.on('draw:deletestop', function() {
    isDeleteModeActive = false;
});

// Add OpenStreetMap tile layer
var osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: ''
}).addTo(map);

// Add Satellite tile layer from Esri
var esriSatelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: ''
});

// Add OpenTopoMap tile layer
var topoLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    attribution: '',
    maxZoom: 15
});

// Base layers for the layer control
var baseLayers = {
    "Standard Map": osmLayer,
    "Satellite View (Esri)": esriSatelliteLayer,
    "Topographic Map": topoLayer
};

// Initialize the FeatureGroup to store editable layers
var drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

var selectedLayer = null;

function saveShapes() {
    var shapes = [];
    drawnItems.eachLayer(function(layer) {
        // Save the layer's style without altering its color
        var saveStyle = { ...layer.options };

        if (layer instanceof L.Circle) {
            shapes.push({
                type: 'circle',
                center: layer.getLatLng(),
                radius: layer.getRadius(),
                style: saveStyle
            });
        } else if (layer instanceof L.Polygon || layer instanceof L.Polyline || layer instanceof L.Rectangle) {
            shapes.push({
                type: 'geojson',
                geojson: layer.toGeoJSON(),
                style: saveStyle
            });
        } else if (layer instanceof L.Marker) {
            var iconOptions = layer.options.icon ? layer.options.icon.options : null;
            shapes.push({
                type: 'marker',
                latlng: layer.getLatLng(),
                style: {
                    ...saveStyle,
                    icon: iconOptions
                }
            });
        }
    });
    localStorage.setItem('shapes', JSON.stringify(shapes));
}

function loadShapes() {
    var savedShapes = localStorage.getItem('shapes');
    if (savedShapes) {
        var shapes = JSON.parse(savedShapes);
        shapes.forEach(function(shape) {
            var layer;
            if (shape.type === 'circle') {
                layer = L.circle(shape.center, {
                    radius: shape.radius,
                    ...shape.style
                });
            } else if (shape.type === 'geojson') {
                layer = L.geoJSON(shape.geojson, {
                    style: shape.style
                }).getLayers()[0];
            } else if (shape.type === 'marker') {
                layer = L.marker(shape.latlng);
            }
            drawnItems.addLayer(layer);
            layer.on('click', function() {
                selectLayer(layer);
            });
        });
    }
}

function addHistoryEntry(action, layer) {
    var coordsText;
    if (layer instanceof L.Circle) {
        var center = layer.getLatLng();
        coordsText = `Circle, Center: [${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}], Radius: ${layer.getRadius().toFixed(2)} meters`;
    } else if (layer instanceof L.Marker) {
        var latlng = layer.getLatLng();
        coordsText = ` Marker, [${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}]`;
    } else if (layer.getBounds) {
        var bounds = layer.getBounds();
        var southWest = bounds.getSouthWest();
        var northEast = bounds.getNorthEast();
        coordsText = ` Polygon, [${southWest.lat.toFixed(6)},${southWest.lng.toFixed(6)},${northEast.lat.toFixed(6)},${northEast.lng.toFixed(6)}]`;
    } else {
        coordsText = 'Unknown layer type';
    }

    var history = loadHistory();
    history.unshift(`${action}: ${coordsText}`);
    saveHistory(history);
    updateHistoryDisplay();
}

// Save history to localStorage
function saveHistory(history) {
    localStorage.setItem('history', JSON.stringify(history));
}

// Load history from localStorage
function loadHistory() {
    return JSON.parse(localStorage.getItem('history')) || [];
}

// Update history display
function updateHistoryDisplay(limit = 5) {
    var history = loadHistory();
    historyList.innerHTML = '';
    var displayedHistory = history.slice(0, limit);

    displayedHistory.forEach(function(entry) {
        var listItem = document.createElement('li');
        listItem.textContent = entry;
        historyList.appendChild(listItem);
    });

    if (history.length > limit) {
        showHistoryButton.style.display = 'block';
        clearHistoryButton.style.display = 'none';
        closeHistoryButton.style.display = 'none';
    } else if (history.length > 0) {
        showHistoryButton.style.display = 'none';
        clearHistoryButton.style.display = 'block';
        closeHistoryButton.style.display = 'none';
    } else {
        showHistoryButton.style.display = 'none';
        clearHistoryButton.style.display = 'none';
        closeHistoryButton.style.display = 'none';
    }
}

// Initialize the draw control and pass it the FeatureGroup of editable layers
var drawControl = new L.Control.Draw({
    edit: {
        featureGroup: drawnItems
    },
    draw: {
        polygon: true,
        polyline: true,
        circle: true,
        marker: true,
        rectangle: true
    }
});

map.addControl(drawControl);

// Add layer control to the map
L.control.layers(baseLayers).addTo(map);

// Add geocoder control to the maps
var geocoder = L.Control.geocoder({
    defaultMarkGeocode: false
}).on('markgeocode', function(e) {
    var center = e.geocode.center;
    var marker = L.marker(center).addTo(map);
    drawnItems.addLayer(marker);
    map.flyTo(center, 15);
}).addTo(map);

// Convert GeoJSON to WKB
function geojsonToWKB(geojson) {
    const features = geojson.features ? geojson.features : [geojson];
    const wkb = new Uint8Array(100 * features.length); // Placeholder size; adjust as necessary
    let offset = 0;

    features.forEach(feature => {
        const coords = feature.geometry.coordinates[0];

        // Set byte order (little endian)
        wkb[offset] = 1; 
        offset += 1;

        // Set WKB type (Polygon = 3)
        wkb[offset] = 3;
        offset += 4;

        // Number of rings (assuming 1)
        wkb[offset] = 1;
        offset += 4;

        // Number of points in ring
        const numPoints = coords.length;
        wkb[offset] = numPoints;
        offset += 4;

        coords.forEach(point => {
            // Convert each point (x, y)
            new DataView(wkb.buffer).setFloat64(offset, point[0], true);
            offset += 8;
            new DataView(wkb.buffer).setFloat64(offset, point[1], true);
            offset += 8;
        });
    });

    return wkb.slice(0, offset);
}

// Convert WKB to Hex string
function wkbToHex(wkb) {
    return Array.from(wkb).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

// Function to parse WKB to coordinates
function parseWKB(wkbHex) {
    const wkb = Uint8Array.from(wkbHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    const view = new DataView(wkb.buffer);
    let offset = 0;

    const byteOrder = view.getUint8(offset); // Byte order
    offset += 1;

    const wkbType = view.getUint32(offset, byteOrder); // WKB type
    offset += 4;

    if (wkbType !== 3) {
        throw new Error('Only Polygon type is supported');
    }

    const numRings = view.getUint32(offset, byteOrder);
    offset += 4;

    if (numRings !== 1) {
        throw new Error('Only single ring polygons are supported');
    }

    const numPoints = view.getUint32(offset, byteOrder);
    offset += 4;

    const coords = [];
    for (let i = 0; i < numPoints; i++) {
        const x = view.getFloat64(offset, byteOrder);
        offset += 8;
        const y = view.getFloat64(offset, byteOrder);
        offset += 8;
        coords.push([x, y]);
    }

    return coords;
}

function updateCoordinatesDisplay(layer) {
    if (!layer) {
        return;
    }

    document.getElementById('copy-coordinates').innerHTML = 'Copy shape coords';
    var coordinatesDiv = document.getElementById('coordinates');
    var format = document.getElementById('coord-format').value;
    var coordinatesText;
    var crs = document.getElementById('crs').value;

    if (layer instanceof L.Polygon || layer instanceof L.Polyline || layer instanceof L.Rectangle) {
        var coords = layer.getLatLngs()[0].map(function(latlng) {
            if (crs === 'EPSG:4326') {
                return [latlng.lng.toFixed(6), latlng.lat.toFixed(6)]; // X (lng) first, then Y (lat)
            } else {
                var projected = proj4('EPSG:4326', crs, [latlng.lat, latlng.lng]);
                return [projected[0].toFixed(2), projected[1].toFixed(2)]; // X (lng) first, then Y (lat)
            }
        });

        switch (format) {
            case 'geojson':
                case 'geojson':
                    var geojson = layer.toGeoJSON();
                    if (crs !== 'EPSG:4326') {
                        geojson.geometry.coordinates[0] = geojson.geometry.coordinates[0].map(function(coord) {
                            var projected = proj4('EPSG:4326', crs, [coord[1], coord[0]]);
                            return [parseFloat(projected[0].toFixed(2)), parseFloat(projected[1].toFixed(2))];
                        });
                    }
                    coordinatesText = JSON.stringify(geojson);
                break;
            case 'wkt':
                coordinatesText = 'POLYGON((' + coords.map(c => c[0] + ' ' + c[1]).join(', ') + '))';
                break;
            case 'wkb':
                coordinatesText = wkbToHex(geojsonToWKB(layer.toGeoJSON()));
                break;
            case 'leaflet':
                coordinatesText = JSON.stringify(coords.map(c => [parseFloat(c[1]), parseFloat(c[0])]));
                break;
            default:
                coordinatesText = 'Invalid format';
        }
    } else if (layer instanceof L.Circle) {
        var areaDiv = document.getElementById('area').style.display = 'none';
        var center = layer.getLatLng();
        var radius = layer.getRadius();
        if (crs === 'EPSG:4326') {
            coordinatesText = `Center: [${center.lng.toFixed(6)}, ${center.lat.toFixed(6)}], Radius: ${radius.toFixed(2)} meters`;
        } else {
            var projectedCenter = proj4('EPSG:4326', crs, [center.lng, center.lat]);
            coordinatesText = `Center: [${projectedCenter[0].toFixed(2)}, ${projectedCenter[1].toFixed(2)}], Radius: ${radius.toFixed(2)} meters`;
        }
    } else if (layer instanceof L.Marker) {

        var latlng = layer.getLatLng();
        if (crs === 'EPSG:4326') {
            coordinatesText = `[${latlng.lng.toFixed(6)}, ${latlng.lat.toFixed(6)}]`;
        } else {
            var projectedLatLng = proj4('EPSG:4326', crs, [latlng.lng, latlng.lat]);
            coordinatesText = `[${projectedLatLng[0].toFixed(2)}, ${projectedLatLng[1].toFixed(2)}]`;
        }
    } else {
        var bounds = layer.getBounds();
        var southWest = bounds.getSouthWest();
        var northEast = bounds.getNorthEast();

        var southWestCoords, northEastCoords;
        if (crs === 'EPSG:4326') {
            southWestCoords = [southWest.lng.toFixed(6), southWest.lat.toFixed(6)];
            northEastCoords = [northEast.lng.toFixed(6), northEast.lat.toFixed(6)];
        } else {
            southWestCoords = proj4('EPSG:4326', crs, [southWest.lng, southWest.lat]);
            northEastCoords = proj4('EPSG:4326', crs, [northEast.lng, northEast.lat]);
            southWestCoords = [southWestCoords[0].toFixed(2), southWestCoords[1].toFixed(2)];
            northEastCoords = [northEastCoords[0].toFixed(2), northEastCoords[1].toFixed(2)];
        }
        coordinatesText = '[' + southWestCoords.join(',') + ',' + northEastCoords.join(',') + ']';
    }

    coordinatesDiv.innerHTML = '<p id="coord-text">Koordinaten (' + crs + '): ' + coordinatesText + '</p>';

    if (!(layer instanceof L.Circle) && !(layer instanceof L.Marker)) {
        var area = L.GeometryUtil.geodesicArea(layer.getLatLngs()[0]);
        var areaFormatted = area.toFixed(2) + ' m²';
        var areaDiv = document.getElementById('area');
        areaDiv.innerHTML = '<p>Area: ' + areaFormatted + '</p>';
        areaDiv.style.display = 'block';
    }
}

document.getElementById('crs').addEventListener('change', function() {
    var layer = // retrieve the current layer in your context
    updateCoordinatesDisplay(layer);
});


function updateFormatOptions(layer) {
    var formatSelect = document.getElementById('coord-format');
    formatSelect.innerHTML = '';

    var options;
    if (layer instanceof L.Polygon || layer instanceof L.Polyline || layer instanceof L.Rectangle) {
        options = [
            { value: 'geojson', text: 'GeoJSON' },
            { value: 'wkt', text: 'WKT' },
            { value: 'wkb', text: 'WKB' },
            { value: 'leaflet', text: 'Leaflet' }
        ];
    } else if (layer instanceof L.Circle) {
        options = [
            { value: 'circles', text: 'circles' },
        ];
    } else if (layer instanceof L.Marker) {
        options = [
            { value: 'geojson', text: 'GeoJSON' },
            { value: 'leaflet', text: 'Leaflet' }
        ];
    } else {
        options = [
            { value: 'bbox', text: 'BBox' },
            { value: 'wkt', text: 'WKT' },
            { value: 'wkb', text: 'WKB' },
            { value: 'leaflet', text: 'Leaflet' },
            { value: 'geojson', text: 'GeoJSON' }
        ];
    }

    options.forEach(function(option) {
        var opt = document.createElement('option');
        opt.value = option.value;
        opt.text = option.text;
        formatSelect.add(opt);
    });

    // Update the coordinates display after changing the options
    updateCoordinatesDisplay(layer);
}

// Function to calculate the overall bounding box of all drawn shapes
function calculateOverallBoundingBox() {
    var coordinatesDiv = document.getElementById('coordinates');
    document.getElementById('copy-coordinates').innerHTML = 'Copy overall bounding box coordinates';

    if (drawnItems.getLayers().length === 0) {
        coordinatesDiv.innerHTML = '<p id="coord-text">No shapes drawn.</p>';
        return;
    }

    var overallBounds = drawnItems.getBounds();
    var southWest = overallBounds.getSouthWest();
    var northEast = overallBounds.getNorthEast();

    // Get the selected CRS
    var crs = document.getElementById('crs').value;
    var southWestCoords, northEastCoords;

    if (crs === 'EPSG:4326') {
        southWestCoords = [southWest.lng.toFixed(6), southWest.lat.toFixed(6)];
        northEastCoords = [northEast.lng.toFixed(6), northEast.lat.toFixed(6)];
    } else {
        var southWestProjected = proj4('EPSG:4326', crs, [southWest.lat, southWest.lng]);
        var northEastProjected = proj4('EPSG:4326', crs, [northEast.lat, northEast.lng]);
        southWestCoords = [southWestProjected[0].toFixed(2), southWestProjected[1].toFixed(2)];
        northEastCoords = [northEastProjected[0].toFixed(2), northEastProjected[1].toFixed(2)];
    }

    var format = document.getElementById('coord-format').value;
    var coordinatesText;

    // Format the coordinates based on the selected format
    switch (format) {
        case 'bbox':
            coordinatesText = '[' + southWestCoords.join(',') + ',' + northEastCoords.join(',') + ']';
            break;
        case 'wkt':
            coordinatesText = 'POLYGON((' + 
                southWestCoords[0] + ' ' + southWestCoords[1] + ',' + // SW corner
                northEastCoords[0] + ' ' + southWestCoords[1] + ',' + // SE corner
                northEastCoords[0] + ' ' + northEastCoords[1] + ',' + // NE corner
                southWestCoords[0] + ' ' + northEastCoords[1] + ',' + // NW corner
                southWestCoords[0] + ' ' + southWestCoords[1] + '))'; // Closing the polygon
            break;
        case 'wkb':
            var geojson = {
                "type": "FeatureCollection",
                "features": [{
                    "type": "Feature",
                    "properties": {},
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [
                            [
                                [parseFloat(southWestCoords[0]), parseFloat(southWestCoords[1])],
                                [parseFloat(northEastCoords[0]), parseFloat(southWestCoords[1])],
                                [parseFloat(northEastCoords[0]), parseFloat(northEastCoords[1])],
                                [parseFloat(southWestCoords[0]), parseFloat(northEastCoords[1])],
                                [parseFloat(southWestCoords[0]), parseFloat(southWestCoords[1])]
                            ]
                        ]
                    }
                }]
            };
            coordinatesText = wkbToHex(geojsonToWKB(geojson));
            break;
        case 'leaflet':
            coordinatesText = '[[' + southWestCoords[1] + ',' + southWestCoords[0] + '],[' + southWestCoords[1] + ',' + northEastCoords[0] + '],[' + northEastCoords[1] + ',' + northEastCoords[0] + '],[' + northEastCoords[1] + ',' + southWestCoords[0] + '],[' + southWestCoords[1] + ',' + southWestCoords[0] + ']]';
            break;
        case 'geojson':
            coordinatesText = `{
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "properties": {},
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [
                                [
                                    [${southWestCoords[0]}, ${southWestCoords[1]}],
                                    [${northEastCoords[0]}, ${southWestCoords[1]}],
                                    [${northEastCoords[0]}, ${northEastCoords[1]}],
                                    [${southWestCoords[0]}, ${northEastCoords[1]}],
                                    [${southWestCoords[0]}, ${southWestCoords[1]}]
                                ]
                            ]
                        }
                    }
                ]
            }`;
            break;
        default:
            coordinatesText = 'Invalid format';
    }

    coordinatesDiv.innerHTML = '<p id="coord-text">Overall Bounding Box Coordinates (' + crs + '): ' + coordinatesText + '</p>';
}


function selectLayer(layer) {
    if (isDeleteModeActive) {
        return;
    }

    // Revert the style of the previously selected layer's border
    if (previousSelectedLayer && previousSelectedLayer !== layer) {
        previousSelectedLayer.setStyle({
            color: previousSelectedLayer.options.originalBorderColor || '#3388ff', // Reset to the original or default color
            weight: 3
        });
    }

    // Store the original border color and weight before changing to red
    layer.options.originalBorderColor = layer.options.color;
    layer.options.originalBorderWeight = layer.options.weight;

    // Apply the red color to indicate selection
    layer.setStyle({
        color: '#ff0000', // Red color for selection
        weight: 5 // Increase border thickness for visibility
    });

    previousSelectedLayer = layer;
    selectedLayer = layer;

    updateCoordinatesDisplay(layer);
    updateFormatOptions(layer);

    if (!(layer instanceof L.Marker)) {
        // Show style controls with the current color and opacity
        document.getElementById('style-controls').style.display = 'block';
        document.getElementById('color').value = layer.options.originalBorderColor || '#3388ff';
        document.getElementById('opacity').value = layer.options.opacity || 1;
        document.getElementById('copy-bbox-coordinates').style.display = '';
    }
}


// Event listener for when a rectangle is created
map.on(L.Draw.Event.CREATED, function(event) {
    var layer = event.layer;

    // Check if the layer has a custom color; otherwise, set the default color
    if (!layer.options.color) {
        layer.setStyle({
            color: '#3388ff', // Standard blue color
            weight: 3,
        });
    }

    drawnItems.addLayer(layer);
    selectLayer(layer);
    layer.on('click', function() {
        selectLayer(layer);
    });
    saveShapes();
    calculateOverallBoundingBox();
    addHistoryEntry('Shape Drawn', layer);
});

// Event listener for map clicks to update overall bounding box
map.on('click', function(e) {
    if (isDeleteModeActive) {
        return;
    }
    if (!e.originalEvent.target.closest('.leaflet-interactive')) {
        // Revert the selected layer to its original style when clicking elsewhere on the map
        if (selectedLayer) {
            selectedLayer.setStyle({
                color: selectedLayer.options.originalBorderColor || selectedLayer.options.color || '#3388ff',
                weight: selectedLayer.options.originalBorderWeight || selectedLayer.options.weight || 3
            });
        }

        selectedLayer = null;
        var coordinatesDiv = document.getElementById('coordinates');
        coordinatesDiv.innerHTML = '';
        var areaDiv = document.getElementById('area');
        areaDiv.innerHTML = '';
        areaDiv.style.display = 'none';
        document.getElementById('style-controls').style.display = 'none';
        document.getElementById('copy-bbox-coordinates').style.display = 'none';
        updateFormatOptions(selectedLayer);
        calculateOverallBoundingBox();
    }
});

// Event listener for when layers are edited
map.on('draw:edited', function(event) {
    var layers = event.layers;
    layers.eachLayer(function(layer) {
        selectLayer(layer);
        addHistoryEntry('Shape Edited', layer); 
    });
    saveShapes();
    calculateOverallBoundingBox(); // Calculate overall bounding box after editing shapes
});

// Event listener for when a layer is deleted
map.on('draw:deleted', function(event) {
    var layers = event.layers;
    layers.eachLayer(function(layer) {
        addHistoryEntry('Shape Deleted', layer); 
    });
    var coordinatesDiv = document.getElementById('coordinates');
    coordinatesDiv.innerHTML = '';
    var areaDiv = document.getElementById('area');
    areaDiv.innerHTML = '';
    areaDiv.style.display = 'none';
    document.getElementById('copy-bbox-coordinates').style.display = 'none';
    document.getElementById('style-controls').style.display = 'none';
    updateFormatOptions();
    saveShapes();
    calculateOverallBoundingBox();
});

// Modal Logic
var modal = document.getElementById('coordinatesModal');
var btn = document.getElementById('insert-coordinates');
var span = document.getElementsByClassName('close')[0];

// Open the modal
btn.onclick = function() {
    modal.style.display = 'block';
}

// Close the modal
span.onclick = function() {
    modal.style.display = 'none';
}

// Close the modal if clicked outside of the modal content
window.onclick = function(event) {
    if (event.target == modal) {
        modal.style.display = 'none';
    }
}

// Add event listener for copying bounding box coordinates
document.getElementById('copy-bbox-coordinates').addEventListener('click', function() {
    if (!selectedLayer) {
        alert('No layer selected.');
        return;
    }
    var bounds = selectedLayer.getBounds();
    var southWest = bounds.getSouthWest();
    var northEast = bounds.getNorthEast();
    var crs = document.getElementById('crs').value;
    console.log(crs);

    var southWestCoords, northEastCoords;
    if (crs === 'EPSG:4326') {
        southWestCoords = [southWest.lng.toFixed(6), southWest.lat.toFixed(6)];
        northEastCoords = [northEast.lng.toFixed(6), northEast.lat.toFixed(6)];
    } else {
        southWestCoords = proj4('EPSG:4326', crs, [southWest.lat, southWest.lng]);
        northEastCoords = proj4('EPSG:4326', crs, [northEast.lat, northEast.lng]);
        southWestCoords = [southWestCoords[0].toFixed(2), southWestCoords[1].toFixed(2)];
        northEastCoords = [northEastCoords[0].toFixed(2), northEastCoords[1].toFixed(2)];
    }
    var coordinatesText = '[' + southWestCoords.join(',') + ',' + northEastCoords.join(',') + ']';

    var tempInput = document.createElement('input');
    document.body.appendChild(tempInput);
    tempInput.value = coordinatesText;
    tempInput.select();
    document.execCommand('copy');
    document.body.removeChild(tempInput);

    var successMessage = document.getElementById('success-message-boundingbox');
    successMessage.style.display = 'block';
    setTimeout(function() {
        successMessage.style.display = 'none';
    }, 2000);
});

// Add click event to copy coordinates to clipboard
document.getElementById('copy-coordinates').addEventListener('click', function() {
    var coordText = document.getElementById('coord-text');
    if (coordText) {
        var coordinatesOnly = coordText.innerText.split(': ').slice(1).join(': ');
        var tempInput = document.createElement('input');
        document.body.appendChild(tempInput);
        tempInput.value = coordinatesOnly;
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);

        var successMessage = document.getElementById('success-message');
        successMessage.style.display = 'block';
        setTimeout(function() {
            successMessage.style.display = 'none';
        }, 2000);
    } else {
        alert('No coordinates to copy.');
    }
});

// Apply the selected style to the selected layer
document.getElementById('apply-style').addEventListener('click', function() {
    if (selectedLayer) {
        var color = document.getElementById('color').value;
        var opacity = document.getElementById('opacity').value;
        selectedLayer.setStyle({
            color: color,
            opacity: opacity,
            fillOpacity: opacity
        });

        // Update the stored original color to the new custom color
        selectedLayer.options.originalBorderColor = color;
        selectedLayer.options.originalBorderWeight = selectedLayer.options.weight;

        saveShapes(); // Save the updated shape with the new style
    }
});

document.getElementById('submit-coordinates').addEventListener('click', function() {
    var input = document.getElementById('bbox-input').value.trim();
    document.getElementById('bbox-input').value = "";
    var crs = document.getElementById('modal-crs').value; // Get the CRS from the modal
    var format = document.getElementById('coord-format-modal').value; // Get the format from the modal

    try {
        let coords = [];

        switch (format) {
            case 'bbox':
                coords = input.replace(/[\[\]]/g, '').split(',').map(parseFloat);
                if (coords.length !== 4) {
                    throw new Error('Invalid BBox format');
                }
                coords = [
                    [coords[0], coords[1]],
                    [coords[2], coords[1]],
                    [coords[2], coords[3]],
                    [coords[0], coords[3]],
                    [coords[0], coords[1]]
                ];
                break;

            case 'circle':
                const circleRegex = /Center: \[([\d.]+), ([\d.]+)\], Radius: ([\d.]+) meters/;
                const match = input.match(circleRegex);
                if (!match) {
                    throw new Error('Invalid circle format');
                }
                const x = parseFloat(match[1]);
                const y = parseFloat(match[2]);
                const radius = parseFloat(match[3]);

                // Project the coordinates if not in EPSG:4326
                let center = [x, y];
                if (crs !== 'EPSG:4326') {
                    center = proj4(crs, 'EPSG:4326', [x, y]);
                }

                // Create the circle and add it to the map
                const circleLayer = L.circle([center[1], center[0]], { radius: radius }).addTo(drawnItems);
                selectLayer(circleLayer);
                circleLayer.on('click', function() {
                    selectLayer(circleLayer);
                });
                saveShapes();
                addHistoryEntry('Coordinates Inserted', circleLayer); // Add history entry
                modal.style.display = 'none';
                break;
            case 'wkt':
                coords = input.replace(/POLYGON\(\(|\)\)/g, '').split(',').map(function(coord) {
                    var [lng, lat] = coord.trim().split(' ').map(parseFloat);
                    return [lng, lat];
                });
                if (coords.length < 3) {
                    throw new Error('Invalid WKT format: A polygon must have at least 3 edges');
                }
                break;
            case 'wkb':
                coords = parseWKB(input);
                if (coords.length < 3) {
                    throw new Error('Invalid WKB format: A polygon must have at least 3 edges');
                }
                break;
            case 'leaflet':
                coords = JSON.parse(input);
                if (!Array.isArray(coords) || coords.length < 3) {
                    throw new Error('Invalid Leaflet format: A polygon must have at least 3 edges');
                }
                // Ensure the coordinates are in [lat, lng] format for Leaflet
                coords = coords.map(function(coord) {
                    if (coord.length !== 2) {
                        throw new Error('Invalid coordinate pair: ' + JSON.stringify(coord));
                    }
                    return [coord[1], coord[0]]; // Switch to [lng, lat]
                });
                break;
            case 'geojson':
                var geojson = JSON.parse(input);
                if (geojson.type === "FeatureCollection" && geojson.features.length > 0) {
                    coords = geojson.features[0].geometry.coordinates[0];
                } else if (geojson.type === "Feature" && geojson.geometry.type === "Polygon") {
                    coords = geojson.geometry.coordinates[0];
                } else if (geojson.type === "Polygon") {
                    coords = geojson.coordinates[0];
                } else {
                    throw new Error('Invalid GeoJSON format');
                }
                break;
            default:
                throw new Error('Invalid format');
        }

        if (coords.length >= 3) {
            var latLngs = coords.map(function(coord) {
                if (coord.length !== 2) {
                    throw new Error('Invalid coordinate pair: ' + JSON.stringify(coord));
                }
                var latlng;
                if (crs === 'EPSG:4326') {
                    latlng = [coord[1], coord[0]]; // [lat, lng]
                } else {
                    var projected = proj4(crs, 'EPSG:4326', [coord[0], coord[1]]);
                    latlng = [projected[0], projected[1]]; // Ensure the correct order [lat, lng]
                }
                return [latlng[0], latlng[1]]; // Return as [lat, lng]
            });
            var layer = L.polygon(latLngs).addTo(drawnItems);
            selectLayer(layer);
            layer.on('click', function() {
                selectLayer(layer);
            });
            saveShapes();
            addHistoryEntry('Coordinates Inserted', layer); // Add history entry
            modal.style.display = 'none';
        } else {
            throw new Error('Please enter valid coordinates in the correct format');
        }
    } catch (e) {
        alert(e.message);
    }
});

// Event listener for when the coordinate format is changed
document.getElementById('coord-format').addEventListener('change', function() {
    if (selectedLayer) {
        updateCoordinatesDisplay(selectedLayer);
    } else {
        calculateOverallBoundingBox();
    }
});

// Event listener for when the CRS is changed
document.getElementById('crs').addEventListener('change', function() {
    if (selectedLayer) {
        updateCoordinatesDisplay(selectedLayer);
    } else {
        calculateOverallBoundingBox();
    }
});

// Event listener for showing the full history
showHistoryButton.addEventListener('click', function() {
    updateHistoryDisplay(loadHistory().length);
    showHistoryButton.style.display = 'none';
    clearHistoryButton.style.display = 'block';
    closeHistoryButton.style.display = 'block';
});

// Event listener for clearing the history
clearHistoryButton.addEventListener('click', function() {
    historyList.innerHTML = '';
    localStorage.removeItem('history');
    showHistoryButton.style.display = 'none';
    clearHistoryButton.style.display = 'none';
    closeHistoryButton.style.display = 'none';
});

// Event listener for closing the history
closeHistoryButton.addEventListener('click', function() {
    updateHistoryDisplay(5);
});

// Add a call to calculateOverallBoundingBox whenever shapes are added, edited, or deleted
drawnItems.on('layeradd layerremove', calculateOverallBoundingBox);
map.on('draw:created draw:edited draw:deleted', calculateOverallBoundingBox);

// If a shape is selected on load, update format options
if (selectedLayer) {
    updateFormatOptions(selectedLayer);
}

loadShapes();
calculateOverallBoundingBox();
updateHistoryDisplay();

document.querySelector('a[title="A JavaScript library for interactive maps"]').style.display = 'none';