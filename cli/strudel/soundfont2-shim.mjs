/* cannoli — soundfont2 only exposes its names to require() in Node. */
import { createRequire } from "node:module";

export const {
  GeneratorType, DEFAULT_GENERATOR_VALUES, ControllerType, ControllerPolarity, ControllerDirection, ControllerPalette, Controller, TransformType, DEFAULT_INSTRUMENT_MODULATORS, SampleType, SF2Chunk, SF_VERSION_LENGTH, SF_PRESET_HEADER_SIZE, SF_BAG_SIZE, SF_MODULATOR_SIZE, SF_GENERATOR_SIZE, SF_INSTRUMENT_HEADER_SIZE, SF_SAMPLE_HEADER_SIZE, DEFAULT_SAMPLE_RATE, SoundFont2,
} = createRequire(import.meta.url)("soundfont2");
