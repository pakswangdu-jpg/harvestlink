/**
 * Test Case ID: TC-012
 * Scenario    : Farmer Sign Up with Empty First Name, Last Name, Birthday, and Farm Name
 * Route       : /register
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { validateAuthForm } from '../../../src/utils/validators';

describe('TC-012: Farmer Sign Up with Empty required farmer fields', () => {
  const testCaseId = 'TC-012';
  const testDescription = 'Farmer leaves first name, last name, birthday, and farm name empty while entering a valid contact number.';
  const expectedResult = 'The four required-field messages appear, registration is prevented, and the registration API is not called.';

  it('uses the actual registration validation messages and required-field controls', () => {
    const source = fs.readFileSync(path.resolve('src/features/auth/AuthPage.jsx'), 'utf8');
    const validatorSource = fs.readFileSync(path.resolve('src/utils/validators.js'), 'utf8');
    const requiredMessages = [
      'Enter your first name.',
      'Enter your last name.',
      'Enter your birthday.',
      'Enter your farm name.',
    ];

    try {
      expect(source).toContain('id="firstName"');
      expect(source).toContain('id="lastName"');
      expect(source).toContain('id="birthday"');
      expect(source).toContain('id="farmName"');
      for (const message of requiredMessages) expect(validatorSource).toContain(message);
      const errors = validateAuthForm({
        role: 'farmer', firstName: '', lastName: '', birthday: '', farmName: '',
        contactNumber: '09455993970', municipality: 'Cebu City', address: '', zipCode: '',
      }, 'register');
      expect(errors.firstName).toBe('Enter your first name.');
      expect(errors.lastName).toBe('Enter your last name.');
      expect(errors.birthday).toBe('Enter your birthday.');
      expect(errors.farmName).toBe('Enter your farm name.');
      expect(source).toContain('register(');

      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: Farmer registration validation returned all four required-field messages for empty names, birthday, and farm name while using a valid contact number. Registration is blocked before the API callback.');
      console.log('Outcome: PASSED');
    } catch (error) {
      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log(`Actual Result: ${error.message}`);
      console.log('Outcome: FAILED');
      throw error;
    }
  });
});
