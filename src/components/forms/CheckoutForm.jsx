import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import Button from '../common/Button';
import FormField from '../common/FormField';
import { CEBU_MUNICIPALITIES, DELIVERY_METHODS, ONLINE_PAYMENT_METHODS, PAYMENT_METHODS } from '../../utils/constants';
import { formatCurrency } from '../../utils/formatters';
import { hasErrors, validateCheckoutForm } from '../../utils/validators';

export default function CheckoutForm({ product, currentUser, onSubmit }) {
  const [values, setValues] = useState(() => ({
    quantity: '',
    message: '',
    paymentMethod: 'cod',
    deliveryMethod: 'farmer_delivery',
    deliveryMunicipality: currentUser.municipality || CEBU_MUNICIPALITIES[0],
  }));
  const [errors, setErrors] = useState({});
  const [stage, setStage] = useState('details');

  const updateField = (field, value) => {
    setValues((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: undefined, form: undefined }));
  };

  const total = (Number(values.quantity) || 0) * Number(product.price);
  const isOnlinePayment = ONLINE_PAYMENT_METHODS.includes(values.paymentMethod);
  const paymentLabel = PAYMENT_METHODS.find((method) => method.value === values.paymentMethod)?.label;

  const handleDetailsSubmit = (event) => {
    event.preventDefault();
    const nextErrors = validateCheckoutForm(values, product, currentUser);
    if (hasErrors(nextErrors)) {
      setErrors(nextErrors);
      return;
    }
    if (isOnlinePayment) {
      setStage('payment');
    } else {
      onSubmit(values);
    }
  };

  const handleConfirmPayment = () => {
    onSubmit(values);
  };

  if (stage === 'payment') {
    return (
      <div className="payment-confirm">
        <div className="payment-confirm-icon">
          <ShieldCheck size={26} />
        </div>
        <h3>Confirm your {paymentLabel} payment</h3>
        <p>This is a simulated checkout for the prototype — no real payment is processed.</p>
        <div className="payment-confirm-total">
          <span>Amount to pay</span>
          <strong>{formatCurrency(total)}</strong>
        </div>
        <div className="form-actions">
          <Button variant="secondary" onClick={() => setStage('details')}>Back</Button>
          <Button onClick={handleConfirmPayment}>Confirm payment</Button>
        </div>
      </div>
    );
  }

  return (
    <form className="form-stack" onSubmit={handleDetailsSubmit}>
      {errors.form ? <div className="form-alert error">{errors.form}</div> : null}

      <FormField
        label="Quantity requested"
        name="quantity"
        error={errors.quantity}
        helper={
          product.sellingType === 'bulk' && product.bulkMinQuantity
            ? `${product.quantity} ${product.unit} available — bulk listing, minimum order ${product.bulkMinQuantity} ${product.unit}`
            : `${product.quantity} ${product.unit} available`
        }
      >
        <input
          id="quantity"
          type="number"
          min="0"
          step="0.01"
          value={values.quantity}
          onChange={(event) => updateField('quantity', event.target.value)}
          placeholder="25"
        />
      </FormField>

      <FormField label="Delivery method" name="deliveryMethod" error={errors.deliveryMethod}>
        <div className="segmented-control three" role="radiogroup" aria-label="Delivery method">
          {DELIVERY_METHODS.map((method) => (
            <button
              key={method.value}
              type="button"
              className={values.deliveryMethod === method.value ? 'active' : ''}
              onClick={() => updateField('deliveryMethod', method.value)}
            >
              {method.label}
            </button>
          ))}
        </div>
      </FormField>

      {values.deliveryMethod !== 'buyer_pickup' ? (
        <FormField label="Deliver to (municipality)" name="deliveryMunicipality" error={errors.deliveryMunicipality}>
          <select
            id="deliveryMunicipality"
            value={values.deliveryMunicipality}
            onChange={(event) => updateField('deliveryMunicipality', event.target.value)}
          >
            {CEBU_MUNICIPALITIES.map((municipality) => <option key={municipality}>{municipality}</option>)}
          </select>
        </FormField>
      ) : null}

      <FormField label="Payment method" name="paymentMethod" error={errors.paymentMethod}>
        <div className="payment-grid" role="radiogroup" aria-label="Payment method">
          {PAYMENT_METHODS.map((method) => (
            <button
              key={method.value}
              type="button"
              className={values.paymentMethod === method.value ? 'active' : ''}
              onClick={() => updateField('paymentMethod', method.value)}
            >
              {method.label}
            </button>
          ))}
        </div>
      </FormField>

      <FormField label="Message to farmer" name="message" helper="Optional pickup, delivery, or timing note.">
        <textarea
          id="message"
          rows="4"
          value={values.message}
          onChange={(event) => updateField('message', event.target.value)}
          placeholder="Can we pick this up tomorrow morning?"
        />
      </FormField>

      <div className="order-total">
        <span>Order total</span>
        <strong>{formatCurrency(total)}</strong>
      </div>

      <Button type="submit" className="full-width">
        {isOnlinePayment ? 'Continue to payment' : 'Place order — pay on delivery'}
      </Button>
    </form>
  );
}
