// Public barrel (SPEC §4.6). WP-02 owns this file.

export { DETECTOR_KINDS, MASK_STYLES } from "@/core/constants";
export { detect } from "@/core/detectors";
export { computeOverlay } from "@/core/overlay";
export { createPrivacyState } from "@/core/state";
export * from "@/core/types";
export { PrivacySpotlight, type PrivacySpotlightProps } from "./PrivacySpotlight";
export { defaultMeasure, type MeasureFn, type ScanOptions, scanSensitive } from "./scanner";
export { type PrivacyController, usePrivacySpotlight } from "./usePrivacySpotlight";
