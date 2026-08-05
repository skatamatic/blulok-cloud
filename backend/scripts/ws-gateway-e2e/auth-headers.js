/** Shared Authorization header builder for E2E HTTP calls. */

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

module.exports = {
  authHeaders,
};
