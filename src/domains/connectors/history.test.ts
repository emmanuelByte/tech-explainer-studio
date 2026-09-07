import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../../store'

describe('diagram undo and redo', () => {
  beforeEach(() => {
    useStore.setState({ ...useStore.getInitialState(), layers: [], connectors: [], _past: [], _future: [] })
    useStore.getState().addTechnicalComponent('client')
    useStore.getState().addTechnicalComponent('server')
    useStore.setState({ _past: [], _future: [] })
  })

  it('undoes connection creation, edits and deletion along with layers', () => {
    const components = useStore.getState().layers.filter((layer) => layer.technicalComponent)
    useStore.getState().addConnector(components[0].id, components[1].id)
    const connection = useStore.getState().connectors[0]
    useStore.getState().undo()
    expect(useStore.getState().connectors).toEqual([])
    useStore.getState().redo()
    expect(useStore.getState().connectors).toEqual([connection])
    useStore.getState().updateConnector(connection.id, { label: 'Requests', routing: 'bezier' })
    useStore.getState().undo()
    expect(useStore.getState().connectors[0]).toEqual(connection)
    useStore.getState().redo()
    expect(useStore.getState().connectors[0]).toMatchObject({ label: 'Requests', routing: 'bezier' })
    useStore.getState().selectConnector(connection.id)
    useStore.getState().deleteConnector(connection.id)
    expect(useStore.getState().selectedConnectorId).toBeNull()
    useStore.getState().undo()
    expect(useStore.getState().connectors[0]).toMatchObject({ label: 'Requests' })
  })

  it('restores attached connectors when undoing component deletion', () => {
    const components = useStore.getState().layers.filter((layer) => layer.technicalComponent)
    useStore.getState().addConnector(components[0].id, components[1].id)
    const before = { layers: useStore.getState().layers, connectors: useStore.getState().connectors }
    useStore.getState().deleteLayer(components[0].id)
    expect(useStore.getState().connectors).toEqual([])
    useStore.getState().undo()
    expect(useStore.getState().layers).toEqual(before.layers)
    expect(useStore.getState().connectors).toEqual(before.connectors)
    useStore.getState().redo()
    expect(useStore.getState().connectors).toEqual([])
    expect(useStore.getState().layers.some((layer) => layer.id === components[0].id)).toBe(false)
  })
})
