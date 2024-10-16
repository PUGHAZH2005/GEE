// Function to create a legend panel
function createLegend(title, colors, labels) {
  var legend = ui.Panel({
    style: {
      position: 'bottom-center',
      padding: '4px 8px',
    },
  });

  var titleLabel = ui.Label(title, {fontWeight: 'bold', fontSize: '18px', margin: '8px 0'});
  legend.add(titleLabel);

  for (var i = 0; i < colors.length; i++) {
    var colorBox = ui.Label({
      style: {
        backgroundColor: colors[i],
        padding: '8px',
        margin: '4px 0',
      },
    });
    var description = ui.Label(labels[i], {margin: '4px 0'});
    legend.add(ui.Panel({
      widgets: [colorBox, description],
      layout: ui.Panel.Layout.Flow('horizontal'),
    }));
  }

  Map.add(legend);
}

// Step 1: Input AOI (Load AOI from a FeatureCollection)
var table = ee.FeatureCollection('projects/ee-rvsgkl20/assets/INDIA_TALUK'); // Replace with your FeatureCollection path
var roi = table.filter(ee.Filter.eq('District', 'WAYANAD')); // Change as needed

// Step 2: Check if AOI is valid
if (roi.size().getInfo() === 0) {
  print('No features found for the specified district. Please check the district name and FeatureCollection.');
} else {
  Map.centerObject(roi, 10.5);
  Map.addLayer(roi, {}, 'A  O    I');

  // Define the time period for data filtering
  var time_start = '2023-01-01'; 
  var time_end = '2023-12-31';

  // Soil Moisture from Sentinel-1
  var soilMoisture = ee.ImageCollection("COPERNICUS/S1_GRD")
    .filterBounds(roi)
    .filterDate(time_start, time_end)
    .filter(ee.Filter.eq('instrumentMode', 'IW'))
    .select('VV')
    .mean()
    .clip(roi);

  // NDVI Calculation using Sentinel-2
  var sentinel2 = ee.ImageCollection("COPERNICUS/S2")
    .filterBounds(roi)
    .filterDate(time_start, time_end)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 3))
    .select(['B4', 'B8']); // Red and NIR bands

  var ndvi = sentinel2.map(function(image) {
    var ndvi_img = image.normalizedDifference(['B8', 'B4']).rename('NDVI');
    return image.addBands(ndvi_img);
  }).median().select('NDVI').clip(roi);

  // Land Surface Temperature (LST) using Landsat 8
  var landsat = ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
    .select('ST_B10')
    .filterBounds(roi)
    .filterDate(time_start, time_end)
    .filter(ee.Filter.lt('CLOUD_COVER', 3))
    .map(function(img) {
      var gain = ee.Number(img.get('TEMPERATURE_MULT_BAND_ST_B10'));
      var offset = ee.Number(img.get('TEMPERATURE_ADD_BAND_ST_B10'));
      return img.multiply(gain).add(offset).copyProperties(img, img.propertyNames());
    });

  var lst_img = landsat.median().clip(roi);

  // Digital Elevation Model (DEM) using SRTM 30m
  var dem = ee.Image("USGS/SRTMGL1_003").clip(roi);

  // Historical and current LST for anomaly calculation
  var historicalLST = ee.ImageCollection("MODIS/006/MOD11A1")
    .filterDate('2001-01-01', '2015-12-31')
    .select('LST_Day_1km')
    .mean()
    .clip(roi)
    .rename('Historical LST');

  var currentLST = ee.ImageCollection("MODIS/006/MOD11A1")
    .filterDate('2016-01-01', '2023-12-31')
    .select('LST_Day_1km')
    .mean()
    .clip(roi)
    .rename('Current LST');

  // Historical and current precipitation for anomaly calculation
  var historicalPrecipitation = ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY")
    .filterDate('2001-01-01', '2015-12-31')
    .select('precipitation')
    .sum()
    .clip(roi)
    .rename('Historical Precipitation');

  var totalPrecipitation = ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY")
   .filterDate('2016-01-01', '2023-12-31')
    .select('precipitation')
    .sum()
    .clip(roi)
    .rename('Current Precipitation');

  // Total Evapotranspiration Calculation (using MODIS ET data)
  var totalEvapotranspiration = ee.ImageCollection("MODIS/006/MOD16A2")
    .filterDate('2016-01-01', '2023-12-31')
    .select('ET')
    .sum()
    .clip(roi)
    .rename('Total Evapotranspiration');

  // Droughtness Index Calculation
  var droughtIndex = totalPrecipitation.subtract(totalEvapotranspiration)
    .divide(totalPrecipitation.add(totalEvapotranspiration))
    .rename('Droughtness Index')
    .clip(roi);
  
  // Temperature Anomaly Calculation
  var tempAnomaly = currentLST.subtract(historicalLST).rename('Temperature Anomaly').clip(roi);

  // Precipitation Anomaly Calculation
  var precipitationAnomaly = totalPrecipitation.subtract(historicalPrecipitation).rename('Precipitation Anomaly').clip(roi);
  
  // Calculate Min/Max for each parameter
  var soilMoistureMinMax = soilMoisture.reduceRegion({
    reducer: ee.Reducer.minMax(),
    geometry: roi,
    scale: 30,
    maxPixels: 1e13
  });

  var ndviMinMax = ndvi.reduceRegion({
    reducer: ee.Reducer.minMax(),
    geometry: roi,
    scale: 30,
    maxPixels: 1e13
  });

  var lstMinMax = lst_img.reduceRegion({
    reducer: ee.Reducer.minMax(),
    geometry: roi,
    scale: 30,
    maxPixels: 1e13
  });
  
  var demMinMax = dem.reduceRegion({
    reducer: ee.Reducer.minMax(),
    geometry: roi,
    scale: 30,
    maxPixels: 1e13
  });
  
  var precipitationMinMax = totalPrecipitation.reduceRegion({
    reducer: ee.Reducer.minMax(),
    geometry: roi,
    scale: 30,
    maxPixels: 1e13
  });

  var evapotranspirationMinMax = totalEvapotranspiration.reduceRegion({
    reducer: ee.Reducer.minMax(),
    geometry: roi,
    scale: 30,
    maxPixels: 1e13
  });

  var droughtIndexMinMax = droughtIndex.reduceRegion({
    reducer: ee.Reducer.minMax(),
    geometry: roi,
    scale: 30,
    maxPixels: 1e13
  });

  var tempAnomalyMinMax = tempAnomaly.reduceRegion({
    reducer: ee.Reducer.minMax(),
    geometry: roi,
    scale: 30,
    maxPixels: 1e13
  });

  var precipitationAnomalyMinMax = precipitationAnomaly.reduceRegion({
    reducer: ee.Reducer.minMax(),
    geometry: roi,
    scale: 30,
    maxPixels: 1e13
  });
// Adding layers to the map
  Map.addLayer(soilMoisture, {min: -24, max: 19, palette: ['blue', 'green', 'yellow', 'red']}, 'Soil Moisture');
  Map.addLayer(ndvi, {min: 0, max: 0.6, palette: ['red', 'yellow', 'green']}, 'NDVI');
  Map.addLayer(lst_img, {}, 'LST Median', false);
  Map.addLayer(dem, {min: 122, max: 2214, palette: ['blue', 'green', 'yellow', 'brown']}, 'DEM');
  Map.addLayer(totalEvapotranspiration, {min: 9805, max: 90990, palette: ['blue', 'green', 'yellow', 'red']}, 'Total Evapotranspiration');
  Map.addLayer(totalPrecipitation, {min: 11292, max: 27233, palette: ['blue', 'green', 'yellow', 'red']}, 'Total Precipitation');
  Map.addLayer(droughtIndex, {min: -0.7, max: 0.3, palette: ['red', 'yellow', 'green']}, 'Droughtness Index');
  Map.addLayer(tempAnomaly, {min:-46 , max: 62, palette: ['blue', 'white', 'red']}, 'Temperature Anomaly');
  Map.addLayer(precipitationAnomaly, {min: 0, max: 100, palette: ['red', 'blue', 'green']}, 'Precipitation Anomaly');
  
  // Create legends for each layer
  createLegend('Soil Moisture', ['blue', 'green', 'yellow', 'red'], ['Wet', 'Moist', 'Dry', 'Very Dry']);
  createLegend('NDVI', ['red', 'yellow', 'green'], ['Low', 'Moderate', 'High']);
  createLegend('DEM', ['blue', 'green', 'yellow', 'brown'], ['Low', 'Medium', 'High','Very High']);
  createLegend('Total Evapotranspiration', [ 'green', 'yellow', 'red'], ['Low ET', 'Medium ET', 'High ET']);
  createLegend('Total Precipitation', [ 'green', 'yellow', 'red'], ['Low Precipitation', 'Medium Precipitation', 'High Precipitation']);
  createLegend('Droughtness Index', ['red', 'yellow', 'green'], ['High Drought', 'Moderate Drought', 'Low Drought']);
  createLegend('Temperature Anomaly', ['blue', 'white', 'red'], ['Cold', 'Normal', 'Hot']);
  createLegend('Precipitation Anomaly', ['red', 'blue', 'green'], ['Dry', 'Normal', 'Wet']);
  
   // Climate Risk Level Calculation with Mid Values
  var riskThresholds = {
    soilMoisture: {low: -15, mid: 0, high: 19},
    ndvi: {low: 0.3, mid: 0.5, high: 0.7},
    lst: {low: 290, mid: 305, high: 324},
    dem: {low: 122, mid: 1000, high: 2214},  // Adjust mid-value based on your data
    droughtIndex: {low: -0.3, mid: 0, high: 0.3},
    tempAnomaly:{low:-10, mid: 20, high: 62},
    precipitationAnomaly:{low: 0, mid:500, high: 1000},
  };

  var vulnerability = soilMoisture.lte(riskThresholds.soilMoisture.mid)
    .add(ndvi.lte(riskThresholds.ndvi.low))
    .add(lst_img.gte(riskThresholds.lst.mid))
    .add(dem.lte(riskThresholds.dem.mid))
    .add(droughtIndex.lte(riskThresholds.droughtIndex.mid))
    .add(tempAnomaly.lte(riskThresholds.tempAnomaly.mid))
    .add(precipitationAnomaly.lt(riskThresholds.precipitationAnomaly.mid));
    
  var hazard = vulnerability;

  // Calculate risk level
  var riskValue = vulnerability.multiply(hazard);
  
  Map.addLayer(riskValue, {min: 0, max: 5, palette: ['green', 'yellow', 'red']}, 'Climate Risk Level');
  createLegend('Climate Risk', ['red', 'blue', 'green'], ['Dry', 'Normal', 'Wet']);
  // Print min/max for each parameter
  print('Soil Moisture Min/Max:', soilMoistureMinMax);
  print('NDVI Min/Max:', ndviMinMax);
  print('LST Min/Max:', lstMinMax);
  print('DEM Min/Max:', demMinMax);
  print('Total Precipitation Min/Max:', precipitationMinMax);
  print('Total Evapotranspiration Min/Max:', evapotranspirationMinMax);
  print('Droughtness Index Min/Max:', droughtIndexMinMax);
  print('Temperature Anomaly Min/Max:', tempAnomalyMinMax);
  print('Precipitation Anomaly Min/Max:', precipitationAnomalyMinMax);
  print('Climate Risk Level Min/Max:', riskValue.reduceRegion({
    reducer: ee.Reducer.minMax(),
    geometry: roi,
    scale: 30,
    maxPixels: 1e13
  }));

  // Print climate risk summary
  print('Climate Risk Level:', riskValue);
}
