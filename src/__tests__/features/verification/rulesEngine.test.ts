import { runRules } from '@features/verification/services/rulesEngine';
import { FullDraft } from '@features/applications/types';

const validDraft: FullDraft = {
  personalDetails: {
    fullName: 'Jane Doe',
    dateOfBirth: '1990-01-01',
    nationality: 'US',
  },
  document: {
    type: 'passport',
    documentNumber: 'AB123456',
    fullName: 'Jane Doe',
    dateOfBirth: '1990-01-01',
    expiryDate: '2030-01-01',
    imagePublicId: 'doc.png',
  },
  selfie: {
    imagePublicId: 'selfie.png',
    liveness: { passed: true, method: 'blink' },
  },
};

describe('rulesEngine.runRules', () => {
  it('passes a fully consistent draft', () => {
    const checks = runRules(validDraft);
    expect(checks.every((c) => c.passed)).toBe(true);
  });

  it('fails an expired document', () => {
    const draft: FullDraft = {
      ...validDraft,
      document: { ...validDraft.document, expiryDate: '2020-01-01' },
    };
    const checks = runRules(draft);
    expect(checks.find((c) => c.name === 'documentExpiry')!.passed).toBe(false);
  });

  it('fails a name mismatch (case/accent-insensitive)', () => {
    const draft: FullDraft = {
      ...validDraft,
      document: { ...validDraft.document, fullName: 'John Smith' },
    };
    const checks = runRules(draft);
    expect(checks.find((c) => c.name === 'nameConsistency')!.passed).toBe(false);
  });

  it('fails an underage date of birth', () => {
    const draft: FullDraft = {
      ...validDraft,
      personalDetails: { ...validDraft.personalDetails, dateOfBirth: '2015-01-01' },
      document: { ...validDraft.document, dateOfBirth: '2015-01-01' },
    };
    const checks = runRules(draft);
    expect(checks.find((c) => c.name === 'dateOfBirth')!.passed).toBe(false);
  });

  it('fails a date-of-birth inconsistency between personal details and document', () => {
    const draft: FullDraft = {
      ...validDraft,
      document: { ...validDraft.document, dateOfBirth: '1991-02-02' },
    };
    const checks = runRules(draft);
    expect(checks.find((c) => c.name === 'dobConsistency')!.passed).toBe(false);
  });
});
