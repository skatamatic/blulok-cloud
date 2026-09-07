/**
 * Gateway PROXY inventory/state payload builders.
 * Payloads require an explicit `kind`.
 */

function gwLockDevice(fields) {
  return { kind: 'lock', ...fields };
}

function gwAccessDevice(fields) {
  return { kind: 'access_control', ...fields };
}

function gwBridgeDevice(fields) {
  return { kind: 'bridge', ...fields };
}

function gwFriendNodeDevice(fields) {
  return { kind: 'friend_node', ...fields };
}

function gwGatewayInventoryUpdate(fields) {
  return { kind: 'gateway', ...fields };
}

module.exports = {
  gwLockDevice,
  gwAccessDevice,
  gwBridgeDevice,
  gwFriendNodeDevice,
  gwGatewayInventoryUpdate,
};
