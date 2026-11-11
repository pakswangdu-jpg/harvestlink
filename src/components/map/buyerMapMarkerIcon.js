import buyerMapPin from '../../assets/icons/buyer-map-pin.png';

export function buildBuyerMapMarkerIcon(mapsApi) {
  const width = 48;
  const height = 62;
  return {
    url: buyerMapPin,
    scaledSize: new mapsApi.Size(width, height),
    anchor: new mapsApi.Point(width / 2, height - 1),
  };
}
