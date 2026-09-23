import { configure } from "@testing-library/react";

// The suite runs files in parallel; under CPU contention a screen that renders correctly can take longer than
// Testing Library's 1 s default to settle, which made `findBy…` assertions fail at random. Give async queries room.
configure({ asyncUtilTimeout: 5000 });
