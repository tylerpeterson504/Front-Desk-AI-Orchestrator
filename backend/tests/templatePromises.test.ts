import { findTemplatePromises } from '../src/lib/templatePromises';

describe('findTemplatePromises (ADR-002 no-promise rule)', () => {
  it('accepts action-taken wording', () => {
    expect(findTemplatePromises('I have shared this with our maintenance team.').hasPromise).toBe(false);
    expect(findTemplatePromises('I have logged your request with housekeeping.').hasPromise).toBe(false);
    expect(findTemplatePromises('Thank you for letting us know about the thermostat.').hasPromise).toBe(false);
  });

  it('rejects future-tense fix promises', () => {
    expect(findTemplatePromises('We will fix this today.').hasPromise).toBe(true);
    expect(findTemplatePromises("We'll take care of it right away.").hasPromise).toBe(true);
    expect(findTemplatePromises('Our team is going to resolve this by the end of the day.').hasPromise).toBe(true);
  });

  it('rejects guarantee phrasing', () => {
    expect(findTemplatePromises('Rest assured, your room will be ready by 3:00 pm.').hasPromise).toBe(true);
    expect(findTemplatePromises('Consider it done!').hasPromise).toBe(true);
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

  it('treats typographic apostrophes like straight ones', () => {
    expect(findTemplatePromises('We’ll take care of it right away.').hasPromise).toBe(true);
    expect(findTemplatePromises('We‘ll take care of it right away.').hasPromise).toBe(true);
    expect(findTemplatePromises('We’ll update you soon.').hasPromise).toBe(true);
  });

  it('rejects update and call-back promises', () => {
    expect(findTemplatePromises('We will update you shortly.').hasPromise).toBe(true);
    expect(findTemplatePromises('We will update you soon.').hasPromise).toBe(true);
    expect(findTemplatePromises('We will update you today.').hasPromise).toBe(true);
    expect(findTemplatePromises('We will update you later.').hasPromise).toBe(true);
    expect(findTemplatePromises("I'll call you back.").hasPromise).toBe(true);
    expect(findTemplatePromises('Someone will call you back.').hasPromise).toBe(true);
  });

  it('rejects look-into promises with a time commitment', () => {
    expect(findTemplatePromises('I will look into it today.').hasPromise).toBe(true);
    expect(findTemplatePromises('We will look into this now.').hasPromise).toBe(true);
    expect(findTemplatePromises('I will look into that right away.').hasPromise).toBe(true);
  });

  it('completes quickly on a 5000-character input', () => {
    const input = 'our team will fix this and '.repeat(200).slice(0, 5000);
    const started = Date.now();

    const result = findTemplatePromises(input);

    expect(Date.now() - started).toBeLessThan(500);
    expect(result.hasPromise).toBe(false);
  });
});
