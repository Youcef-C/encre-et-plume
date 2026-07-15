import '@testing-library/jest-dom';
import { configure } from '@testing-library/react';

// Raise the async-util ceiling (waitFor/findBy default 1000ms). Only affects tests that would
// otherwise TIME OUT — a passing assertion still resolves on its first satisfied poll, so this
// doesn't slow the suite; it just stops async-render assertions from flaking under CI CPU contention.
configure({ asyncUtilTimeout: 5_000 });
