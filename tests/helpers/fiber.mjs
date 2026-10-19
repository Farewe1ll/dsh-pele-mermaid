/** Static recognition fixture only. Lifecycle coverage uses real React. */
export function attachCodeBlockFiber(block, props) {
  const root = { tag: 3, return: null, stateNode: {} }
  root.stateNode.current = root
  const component = { return: root, memoizedProps: props }
  const host = { return: component, stateNode: block, memoizedProps: { className: block.className } }
  root.child = component
  component.child = host
  block.__reactFiber$fixture = host
  return component
}
