// Step 1: Input AOI (Load AOI from a FeatureCollection)
var table = ee.FeatureCollection('projects/ee-rvsgkl20/assets/INDIA_TALUK'); // Replace with your FeatureCollection path
var aoi = table.filter(ee.Filter.eq('District', 'BENGAL@RU URBAN'));

// Step 2: Check if AOI is valid
if (aoi.size().getInfo() === 0) {
  print('No features found for the specified district. Please check the district name and FeatureCollection.');
} else {
  // Step 3: Load Precipitation Data (CHIRPS dataset for daily precipitation)
  var startDate = '2023-11-01';
  var endDate = '2023-12-31';
  var precipitation = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
                        .filterBounds(aoi)
                        .filterDate(startDate, endDate)
                        .mean()
                        .clip(aoi);
  
  // Step 4: Load ESA WorldCover 2020 Data
  var worldCover = ee.ImageCollection('ESA/WorldCover/v100')
                       .filterDate('2020-01-01', '2020-12-31')
                       .first()
                       .select('Map') // Select the land cover band
                       .clip(aoi);

  // Check if worldCover data is defined
  if (worldCover) {
    print('ESA WorldCover 2020 Image:', worldCover);
    
    // Step 5: Create a Curve Number image using an expression
    var curveNumberImage = worldCover.expression(
      'landCover == 10 ? 100 : ' + // Tree cover
      'landCover == 20 ? 70 : ' +  // Shrubland
      'landCover == 30 ? 55 : ' +  // Grassland
      'landCover == 40 ? 82 : ' +  // Cropland
      'landCover == 50 ? 88 : ' +  // Built-up areas
      'landCover == 60 ? 60 : ' +  // Bare land
      'landCover == 70 ? 70 : ' +  // Water bodies
      'landCover == 80 ? 80 : ' +  // Wetlands
      'landCover == 90 ? 85 : ' +  // Snow and ice
      'landCover == 95 ? 75 : ' +  // Permanent water bodies
      '100', { 'landCover': worldCover }); // Default to CN of 100 for unknown land cover

    // Step 6: Calculate S based on CN
    var S = curveNumberImage.expression('25400 / CN - 254', {CN: curveNumberImage});

    // Step 7: Calculate Initial Abstraction (Ia)
    var Ia = S.multiply(0.2); // Initial abstraction (20% of S)

    // Step 8: Apply the SCS Runoff Equation: Q = (P - Ia)^2 / (P - Ia + S)
    var runoff = precipitation.expression(
      '(P - Ia) ** 2 / (P - Ia + S)', {
        P: precipitation,
        Ia: Ia,
        S: S
    }).max(0);

    // Step 9: Export the Surface Runoff image to Google Drive
    Export.image.toDrive({
      image: runoff,
      description: 'Surface_Runoff_Bengaluru_Urban',
      scale: 10, // Set the scale (in meters) for the exported image
      region: aoi.geometry(), // The region to export
      fileFormat: 'GeoTIFF', // File format
      maxPixels: 1e13 // Maximum number of pixels to export
    });

    // Step 10: Visualization
    Map.centerObject(aoi, 10.5);
    Map.addLayer(runoff, {min: 0, max: 100, palette: ['lightblue', 'darkblue']}, 'Surface Runoff');
    Map.addLayer(worldCover, {min: 10, max: 95, palette: ['#006400', '#FFA500', '#FFFF00', '#FF69B4', '#FF0000', '#8B4513', '#00FFFF', '#0000FF', '#FFFFFF', '#00008B']}, 'ESA WorldCover 2020', false);
    Map.addLayer(aoi, {color: ''}, 'AOI');

    // Function to create a legend
    function createLegend(title, items) {
      var legend = ui.Panel({style: {position: 'bottom-right', padding: '8px 15px'}});
      var legendTitle = ui.Label({value: title, style: {fontWeight: 'bold', fontSize: '18px', margin: '0 0 4px 0', padding: '0'}});
      legend.add(legendTitle);
      items.forEach(function(item) {
        var colorBox = ui.Label({style: {backgroundColor: item.color, padding: '8px', margin: '0 0 4px 0'}});
        var description = ui.Label({value: item.name, style: {margin: '0 0 4px 6px'}});
        var legendItem = ui.Panel({widgets: [colorBox, description], layout: ui.Panel.Layout.Flow('horizontal')});
        legend.add(legendItem);
      });
      return legend;
    }

    // Add Legends for Surface Runoff and ESA WorldCover
    var runoffLegendItems = [
      {color: 'lightblue', name: 'Low Runoff'},
      {color: 'blue', name: 'High Runoff'},
    ];

    var landCoverLegendItems = [
      {color: '#006400', name: 'Tree cover'},           // Dark green
      {color: '#FFA500', name: 'Shrubland'},           // Light orange
      {color: '#FFFF00', name: 'Grassland'},           // Yellow
      {color: '#FF69B4', name: 'Cropland'},            // Pink
      {color: '#FF0000', name: 'Built-up areas'},      // Red
      {color: '#8B4513', name: 'Bare land'},           // Brown
      {color: '#00FFFF', name: 'Wetlands'},        // Blue
      {color: '#0000FF', name: 'Water Bodies'},            // Cyan (greenish-blue)
      {color: '#FFFFFF', name: 'Snow and ice'},        // White
      {color: '#00008B', name: 'Permanent water bodies'} // Dark blue
    ];

    Map.add(createLegend('Surface Runoff ', runoffLegendItems));
    Map.add(createLegend('ESA WorldCover ', landCoverLegendItems));

    // Step 11: Histogram of ESA WorldCover Land Cover
    print(ui.Chart.image.histogram(worldCover, aoi, 500));

    // Calculate area by land cover class
    var worldCoverArea = ee.Image.pixelArea().divide(1e6).addBands(worldCover);
    print(
      ui.Chart.image.byClass({
        image: worldCoverArea,
        classBand: 'Map',
        region: aoi,
        reducer: ee.Reducer.sum(),
        scale: 500
      })
    );
  } else {
    print('No valid ESA WorldCover land cover image found. Please check the collection and filters.');
  }
}
