import { validateManifest } from '../validator';
import { MUSIC_MANIFEST } from '../variants/music';

const valid = (): Record<string, unknown> => JSON.parse(JSON.stringify(MUSIC_MANIFEST));

describe('validateManifest trait decision_trigger', () => {
  it('accepts a valid decision trigger', () => {
    const m = valid();
    (m.traits as Array<Record<string, unknown>>)[0].decision_trigger = {
      template_key:   'scandal_denial',
      option_key:     'go_quiet',
      required_count: 3,
      probability:    1,
    };

    expect(() => validateManifest(m)).not.toThrow();
  });

  it('throws when decision trigger probability is outside [0, 1]', () => {
    const m = valid();
    (m.traits as Array<Record<string, unknown>>)[0].decision_trigger = {
      template_key:   'scandal_denial',
      option_key:     'go_quiet',
      required_count: 3,
      probability:    1.1,
    };

    expect(() => validateManifest(m)).toThrow(/decision_trigger\.probability/);
  });
});
