import { findTemplatePromises } from '../src/lib/templatePromises';

describe('findTemplatePromises (ADR-002 no-promise rule)', () => {
  it('accepts action-taken wording', () => {
    expect(findTemplatePromises('I have shared this with our maintenance team.').hasPromise).toBe(false);
    expect(findTemplatePromises('I have logged your request with housekeeping.').hasPromise).toBe(false);
    expect(findTemplatePromises('Thank you for letting us know about the thermostat.').hasPromise).toBe(false);
    expect(findTemplatePromises('Rest assured, maintenance has been notified.').hasPromise).toBe(false);
  });

  it('rejects future-tense fix promises', () => {
    expect(findTemplatePromises('We will fix this today.').hasPromise).toBe(true);
    expect(findTemplatePromises("We'll take care of it right away.").hasPromise).toBe(true);
    expect(findTemplatePromises('Our team is going to resolve this by the end of the day.').hasPromise).toBe(true);
  });

  it('rejects guarantee and reassurance phrasing', () => {
    expect(findTemplatePromises('Consider it done!').hasPromise).toBe(true);
    expect(findTemplatePromises("It's as good as done.").hasPromise).toBe(true);
    expect(findTemplatePromises('Done deal.').hasPromise).toBe(true);
    expect(findTemplatePromises('We guarantee it.').hasPromise).toBe(true);
  });

  it('rejects passive promises with or without a deadline', () => {
    expect(findTemplatePromises('The leak will be fixed.').hasPromise).toBe(true);
    expect(findTemplatePromises('The leak will be fixed tomorrow.').hasPromise).toBe(true);
    expect(findTemplatePromises('Your key will be ready.').hasPromise).toBe(true);
  });

  it('rejects follow-up promises', () => {
    expect(findTemplatePromises('We will follow up with you shortly.').hasPromise).toBe(true);
    expect(findTemplatePromises("I'll get back to you as soon as I hear from the manager.").hasPromise).toBe(true);
  });

  it('is case-insensitive and reports the matched pattern', () => {
    const result = findTemplatePromises('WE WILL REPAIR THIS IMMEDIATELY.');
    expect(result.hasPromise).toBe(true);
    expect(result.matchedPattern).toBeDefined();
  });

  it('handles empty and non-string input safely', () => {
    expect(findTemplatePromises('').hasPromise).toBe(false);
    expect(findTemplatePromises(undefined as unknown as string).hasPromise).toBe(false);
  });
});
