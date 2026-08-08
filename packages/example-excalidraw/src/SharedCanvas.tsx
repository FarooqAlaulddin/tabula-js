/**
 * SharedCanvas — connects Excalidraw directly to Tabula cross-tab state.
 *
 * The <Excalidraw> component is used AS-IS, zero modifications.
 * This application component connects it to Tabula shared state so the canvas
 * stays in sync across browser tabs automatically.
 */
import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { workspace } from './workspace'

export function SharedCanvas() {
	const [api, setApi] = useState<any>(null)
	const [initialElements, setInitialElements] = useState<unknown[] | null>(null)
	const [ready, setReady] = useState(false)

	// Tracks what we last sent — used to skip self-echo from state listeners
	const lastSentRef = useRef<unknown[] | null>(null)
	// Suppresses onChange fired by updateScene (remote apply)
	const isApplyingRemote = useRef(false)

	// Wait for Tabula workspace, then load existing drawing if any
	useEffect(() => {
		workspace.ready.then(() => {
			const existing = workspace.state.get('elements')
			if (existing) setInitialElements(existing)
			setReady(true)
		})
	}, [])

	// Debounced sync: local drawing changes → Tabula shared state
	const syncToTabula = useMemo(() => {
		let timer: ReturnType<typeof setTimeout>
		const sync = (elements: unknown[]) => {
			clearTimeout(timer)
			timer = setTimeout(() => {
				lastSentRef.current = elements
				workspace.state.set('elements', elements)
			}, 300)
		}
		sync.cancel = () => clearTimeout(timer)
		return sync
	}, [])

	// Excalidraw onChange → debounced sync to Tabula
	const handleChange = useCallback(
		(elements: readonly any[]) => {
			if (isApplyingRemote.current) return
			syncToTabula([...elements])
		},
		[syncToTabula],
	)

	// Listen for remote state changes → update Excalidraw canvas
	useEffect(() => {
		if (!api) return

		const unsub = workspace.state.on('elements', (value: unknown) => {
			const elements = value as unknown[] | undefined
			if (!elements || elements === lastSentRef.current) return

			// Cancel any pending local sync to avoid overwriting remote data
			syncToTabula.cancel()

			isApplyingRemote.current = true
			api.updateScene({ elements })
			setTimeout(() => {
				isApplyingRemote.current = false
			}, 100)
		})
		return unsub
	}, [api, syncToTabula])

	if (!ready) {
		return (
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					height: '100%',
					color: '#888',
					fontSize: 14,
				}}
			>
				Connecting to workspace...
			</div>
		)
	}

	return (
		<Excalidraw
			excalidrawAPI={(ref: any) => setApi(ref)}
			initialData={initialElements ? { elements: initialElements as any } : undefined}
			onChange={handleChange}
			theme={workspace.state.get('theme') ?? 'light'}
		/>
	)
}
