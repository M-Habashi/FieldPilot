import { describe, expect, it } from 'vitest';
import {
  activeFieldPilotToolNames,
  fieldPilotInstructions,
  shouldOfferProjectSkills,
} from './fieldPilot';

describe('FieldPilot agent tool surface', () => {
  it('starts with only the skill loader and activates domain tools lazily', () => {
    expect(activeFieldPilotToolNames(true, new Set())).toEqual(['load_skill']);
    expect(activeFieldPilotToolNames(true, new Set(), false)).toEqual([]);
    expect(activeFieldPilotToolNames(true, new Set(['tasks']))).toEqual([
      'load_skill',
      'inspect_project_data',
      'change_project_data',
      'prepare_new_task',
    ]);
    expect(activeFieldPilotToolNames(false, new Set(['images']))).toEqual([
      'load_skill',
      'inspect_images',
      'analyze_images',
    ]);
    expect(activeFieldPilotToolNames(true, new Set(['images']))).toEqual([
      'load_skill',
      'inspect_images',
      'analyze_images',
      'change_image_data',
      'delete_images_permanently',
    ]);
    expect(activeFieldPilotToolNames(true, new Set(['quantities']))).toEqual([
      'load_skill',
      'inspect_calculations',
      'change_calculation_data',
    ]);
    expect(activeFieldPilotToolNames(false, new Set(['quantities']))).toEqual([
      'load_skill',
      'inspect_calculations',
    ]);
  });

  it('hard-disables tools for simple greetings and thanks', () => {
    expect(shouldOfferProjectSkills('Hi!')).toBe(false);
    expect(shouldOfferProjectSkills('hello FieldPilot')).toBe(false);
    expect(shouldOfferProjectSkills('Thank you very much.')).toBe(false);
    expect(shouldOfferProjectSkills('How many photos are in this project?')).toBe(true);
    expect(shouldOfferProjectSkills('Change task 6 to blue')).toBe(true);
  });

  it('keeps the main prompt concise and forbids tool calls for greetings', () => {
    const instructions = fieldPilotInstructions({ projectName: 'Demo' });
    expect(instructions).toContain('For greetings');
    expect(instructions).toContain('do not call a tool');
    expect(instructions).toContain('Resolve omitted subjects only from this conversation');
    expect(instructions).toContain('ask one focused question before loading a skill');
    expect(instructions).toContain('never from the open app view');
    expect(instructions).toContain('ensure exactly the relevant skill is loaded');
    expect(instructions).toContain('Never guess or reuse project facts from conversation history');
    expect(instructions).toContain('Normal photo counts must list exactly five lines');
    expect(instructions).toContain(
      'Never mention trash unless the current message explicitly asks',
    );
    expect(instructions).not.toContain('Use inspect_project_data whenever');
    expect(instructions.split('\n').length).toBeLessThanOrEqual(12);
  });

  it('directly clarifies omitted subjects on the first turn of a conversation', () => {
    const instructions = fieldPilotInstructions({ view: 'map' }, true);
    expect(instructions).toContain('This is the first turn of a new conversation');
    expect(instructions).toContain('ask what it refers to and call no tool');
    expect(instructions).toContain('“Which are assigned?”');
  });
});
