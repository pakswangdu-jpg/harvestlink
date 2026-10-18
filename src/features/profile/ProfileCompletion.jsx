import { Check, CheckCircle2, Circle } from 'lucide-react';
import { getProfileCompletion } from './profileCompletionRules.js';
import './ProfileCompletion.css';

const CIRCUMFERENCE = 2 * Math.PI * 34;

function CompletionRow({ complete, children }) {
  const Icon = complete ? CheckCircle2 : Circle;
  return <li className={complete ? 'done' : ''}><Icon size={16} aria-hidden="true" />{children}</li>;
}

export default function ProfileCompletion({ user }) {
  const completion = getProfileCompletion(user);
  if (!completion) return null;
  const { fields, total, completed, remaining, percent } = completion;
  const deliveryComplete = fields.municipality && fields.address && fields.zipCode;
  const isFarmer = user.role === 'farmer';
  const isStakeholder = user.role === 'stakeholder';
  const roleLabel = isFarmer ? 'Farmer' : isStakeholder ? 'Stakeholder' : 'Buyer';
  const addressLabel = isStakeholder ? 'Organization address' : isFarmer ? 'Farm address' : 'Delivery address';
  const hasFarmerDocument = typeof user.govIdFile === 'string' && Boolean(user.govIdFile.trim());
  const organizationComplete = isStakeholder && ['organizationName', 'organizationType', 'contactPerson', 'organizationDescription', 'barangay', 'partnershipDescription'].every((field) => fields[field]);
  const verificationLabel = ({ verified: 'Verified', pending: 'Pending', rejected: 'Rejected' })[user.verificationStatus] || 'Not available';
  return (
    <div className="profile-completion-details">
      <div className="profile-completion">
        <div className="profile-completion-ring" role="progressbar" aria-label="Profile completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${completed} of ${total} required fields added`}>
          <svg viewBox="0 0 80 80" aria-hidden="true">
            <circle className="profile-completion-track" cx="40" cy="40" r="34" />
            <circle className="profile-completion-progress" cx="40" cy="40" r="34" strokeDasharray={CIRCUMFERENCE} strokeDashoffset={CIRCUMFERENCE * (1 - percent / 100)} transform="rotate(-90 40 40)" />
          </svg>
          <span aria-hidden="true">{remaining === 0 ? <Check size={14} /> : null}<strong>{percent}%</strong></span>
        </div>
        <div>
          <h3>{remaining === 0 ? 'Profile complete' : 'Profile incomplete'}</h3>
          <p>{remaining === 0 ? 'All required account information has been added.' : `${remaining} required ${remaining === 1 ? 'item' : 'items'} remaining.`}</p>
        </div>
      </div>
      <ul className="profile-completion-checklist">
        <CompletionRow complete={fields.contactNumber}>{fields.contactNumber ? 'Contact information added' : 'Contact number incomplete'}</CompletionRow>
        {isFarmer ? <CompletionRow complete={fields.farmName && fields.municipality}>{fields.farmName && fields.municipality ? 'Farm information added' : 'Farm information incomplete'}</CompletionRow> : null}
        {isStakeholder ? <CompletionRow complete={organizationComplete}>{organizationComplete ? 'Organization information added' : 'Organization information incomplete'}</CompletionRow> : null}
        <CompletionRow complete={deliveryComplete}>{`${addressLabel} ${deliveryComplete ? 'saved' : 'incomplete'}`}</CompletionRow>
        {isFarmer ? <CompletionRow complete={hasFarmerDocument}>{hasFarmerDocument ? 'Verification document provided' : 'Verification document not provided (optional)'}</CompletionRow> : null}
        {isStakeholder ? <CompletionRow complete={fields.accreditationFile}>{fields.accreditationFile ? 'Required document provided' : 'Required document missing'}</CompletionRow> : null}
        <CompletionRow complete={user.accountStatus === 'active'}>{`${roleLabel} account ${user.accountStatus || 'status unavailable'}`}</CompletionRow>
        {isFarmer || isStakeholder ? <CompletionRow complete={user.verificationStatus === 'verified'}>{`${isFarmer ? 'Farmer' : 'Organization'} verification: ${verificationLabel}`}</CompletionRow> : null}
        {remaining > 0 ? <CompletionRow complete={false}>{remaining} profile {remaining === 1 ? 'field' : 'fields'} remaining</CompletionRow> : null}
      </ul>
    </div>
  );
}
