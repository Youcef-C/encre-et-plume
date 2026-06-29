"use strict";
// Shared auth contracts for F-1 (account sign-up & login).
// Both apps/web and apps/api import these so request/response shapes never drift.
Object.defineProperty(exports, "__esModule", { value: true });
exports.USER_ROLES = void 0;
exports.USER_ROLES = [
    'utilisateur',
    'maintainer',
    'editor',
    'admin',
];
