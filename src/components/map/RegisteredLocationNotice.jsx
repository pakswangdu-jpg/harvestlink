import { Link } from 'react-router-dom';

export default function RegisteredLocationNotice({ hasLocation }) {
  return hasLocation ? (
    <p className="registered-location-notice">Your saved profile location is used to sort farmers nearest to farthest. Distances are straight-line distances.</p>
  ) : (
    <div className="registered-location-notice" role="status">
      <strong>Location not set</strong>
      <p>Add your location to your profile to see farmers nearest to you.</p>
      <Link to="/profile">Update profile location</Link>
    </div>
  );
}
