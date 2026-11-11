import donateMapPin from '../../assets/icons/donate-map-pin.png';

export function buildDonateMapMarkerIcon(mapsApi, width = 40, height = 52) {
  return {
    url: donateMapPin,
    scaledSize: new mapsApi.Size(width, height),
    anchor: new mapsApi.Point(width / 2, height - 1),
  };
}
