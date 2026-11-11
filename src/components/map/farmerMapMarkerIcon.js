import farmerMapPin from '../../assets/icons/farmer-map-pin.png';

export function buildFarmerMapMarkerIcon(mapsApi) {
  return {
    url: farmerMapPin,
    scaledSize: new mapsApi.Size(40, 51),
    anchor: new mapsApi.Point(20, 50),
  };
}
