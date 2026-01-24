import {useAudioStore} from '../hooks/useAudioStore';
import type {LoopState, PlaybackState} from '../types/audio';
import {alpha, type Theme} from '@mui/material/styles';
// Find Shadow DOM wrapper element
export const getShadowWrapper = (containerRef: React.RefObject<HTMLDivElement>): HTMLElement | null => {
    if (!containerRef.current) return null;

    for (let i = 0; i < containerRef.current.children.length; i++) {
        const child = containerRef.current.children[i] as HTMLElement;
        if (child.shadowRoot) {
            return child.shadowRoot.querySelector('.wrapper') as HTMLElement;
        }
    }
    return null;
};

// Find wavesurfer element with shadow root
export const getWaveSurferElement = (containerRef: React.RefObject<HTMLDivElement | null>): HTMLElement | null => {
    if (!containerRef.current) return null;

    for (let i = 0; i < containerRef.current.children.length; i++) {
        const child = containerRef.current.children[i] as HTMLElement;
        if (child.shadowRoot) {
            return child;
        }
    }
    return null;
};

// Inject markers and loops into Shadow DOM
export const injectMarkersAndLoops = (
    wsElement: HTMLElement,
    loopState: LoopState,
    playbackState: PlaybackState,
    theme: Theme
) => {
    if (!wsElement || !wsElement.shadowRoot) return;

    const wrapper = wsElement.shadowRoot.querySelector('.wrapper') as HTMLElement;
    if (!wrapper) return;

    const duration = playbackState.duration;
    if (duration === 0) return;

    // Remove existing markers/loops
    wrapper.querySelectorAll('[data-loop-marker], [data-loop-zone]').forEach(el => el.remove());

    const isPlaying = playbackState.isPlaying;

    // Inject loops first (under markers visually)
    loopState.loops.forEach(loop => {
        const startMarker = loopState.markers.find(m => m.id === loop.startMarkerId);
        const endMarker = loopState.markers.find(m => m.id === loop.endMarkerId);

        if (!startMarker || !endMarker) return;

        const startPercent = (startMarker.time / duration) * 100;
        const widthPercent = ((endMarker.time - startMarker.time) / duration) * 100;

        // Loop is "active" (blue) only if enabled AND playing
        const isActiveLoop = loop.enabled && isPlaying;

        // Convert theme colors to rgba
        const primaryColor = theme.palette.primary.light;
        const greyColor =  theme.palette.grey[500];

        const loopDiv = document.createElement('div');
        loopDiv.setAttribute('data-loop-zone', loop.id);
        loopDiv.style.position = 'absolute';
        loopDiv.style.left = `${startPercent}%`;
        loopDiv.style.width = `${widthPercent}%`;
        loopDiv.style.top = '0';
        loopDiv.style.bottom = '0';
        loopDiv.style.backgroundColor = `${alpha(greyColor, 0.2)}`
        loopDiv.style.borderWidth = '2px'
        loopDiv.style.borderStyle = "solid";
        loopDiv.style.borderLeftStyle = "none";
        loopDiv.style.borderRightStyle = "none";
        loopDiv.style.borderColor = isActiveLoop ? primaryColor : "transparent";
        // loopDiv.style.borderRadius = '6px';
        loopDiv.style.zIndex = '5';
        loopDiv.style.pointerEvents = loopState.editMode ? 'none' : 'auto';
        loopDiv.style.cursor = loopState.editMode ? 'default' : 'pointer';
        loopDiv.style.transition = 'background-color 0.2s, border-color 0.2s, transform 0.1s';

        // Add hover effect (only in standard mode)
        if (!loopState.editMode) {
            loopDiv.addEventListener('mouseenter', () => {
                loopDiv.style.backgroundColor = isActiveLoop ?`${alpha(primaryColor, 0.35)}` : `${alpha(primaryColor, 0.25)}`
                // loopDiv.style.transform = 'scaleY(1.05)';
            });

            loopDiv.addEventListener('mouseleave', () => {
                loopDiv.style.backgroundColor = `${alpha(greyColor, 0.2)}`
                // loopDiv.style.transform = 'scaleY(1)';
            });

            // Click to activate loop and start playback from loop start
            loopDiv.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log(`🔁 Loop zone clicked: ${loop.id}`);

                const {setActiveLoop, play, seek} = useAudioStore.getState();

                // Always activate this loop (disable others)
                setActiveLoop(loop.id);

                // Seek to loop start
                seek(startMarker.time);

                // Always start playback
                play();
            });
        }

        wrapper.appendChild(loopDiv);
    });

    // Inject markers
    loopState.markers.forEach((marker, index) => {
        const leftPercent = (marker.time / duration) * 100;

        const isInActiveLoop = loopState.loops.find(
            l => l.enabled && isPlaying && (l.startMarkerId === marker.id || l.endMarkerId === marker.id)
        );

        const primaryColor = theme.palette.primary.light;
        // const greyColor =  theme.palette.grey[500];
        const greyColor =  theme.palette.text.secondary;

        const markerDiv = document.createElement('div');
        markerDiv.setAttribute('data-loop-marker', marker.id);
        markerDiv.style.position = 'absolute';
        markerDiv.style.left = `${leftPercent}%`;
        markerDiv.style.top = '0';
        markerDiv.style.bottom = '0';
        markerDiv.style.width = '2px';
        markerDiv.style.backgroundColor = isInActiveLoop ?  primaryColor : greyColor;
        markerDiv.style.zIndex = '10';
        markerDiv.style.pointerEvents = loopState.editMode ? 'none' : 'auto';
        markerDiv.style.cursor = 'pointer';

        // Add marker number
        const label = document.createElement('div');
        label.textContent = `${index + 1}`;
        label.style.position = 'absolute';
        label.style.top = '3px';
        label.style.left = '4px';
        label.style.fontSize = '10px';
        label.style.fontWeight = 'bold';
        label.style.color = isInActiveLoop ? theme.palette.primary.contrastText : greyColor;
        label.style.backgroundColor = isInActiveLoop ? primaryColor : theme.palette.background.paper
        label.style.padding = '2px 4px';
        label.style.borderRadius = '3px';
        markerDiv.appendChild(label);

        wrapper.appendChild(markerDiv);
    });
};

// Setup edit mode interactions in Shadow DOM
export const setupEditModeInteractions = (
    wrapper: HTMLElement,
    wsElement: HTMLElement,
    loopState: LoopState,
    playbackState: PlaybackState,
    isDraggingRef: React.MutableRefObject<boolean>,
    theme: Theme
) => {
    // Remove existing interaction layer
    wrapper.querySelectorAll('[data-edit-layer]').forEach(el => el.remove());

    // Also disable pointer events on canvases when in edit mode
    const canvases = wrapper.querySelectorAll('canvas');
    canvases.forEach(canvas => {
        (canvas as HTMLElement).style.pointerEvents = loopState.editMode ? 'none' : 'auto';
    });

    if (!loopState.editMode) return; // Only in edit mode

    const duration = playbackState.duration;
    if (duration === 0) return;

    // Create interaction layer
    const editLayer = document.createElement('div');
    editLayer.setAttribute('data-edit-layer', 'true');
    editLayer.style.position = 'absolute';
    editLayer.style.inset = '0';
    editLayer.style.zIndex = '10000';
    editLayer.style.cursor = 'crosshair';
    editLayer.style.pointerEvents = 'auto';
    editLayer.style.touchAction = 'none'; // CRITICAL: prevent browser touch gestures!

    let dragStartTime: number | null = null;
    let isDragging = false;
    let previewDiv: HTMLElement | null = null;
    let draggedMarkerId: string | null = null;
    let hoveredMarkerId: string | null = null;

    // Helper: Find marker at given time
    const findMarkerAtTime = (time: number): string | null => {
        const threshold = duration * 0.02; // 2% tolerance
        const marker = loopState.markers.find(m => Math.abs(m.time - time) < threshold);
        return marker?.id || null;
    };

    // Helper: Get time from pointer event
    const getTimeFromEvent = (e: PointerEvent): number => {
        const scrollElement = wsElement.shadowRoot!.querySelector('.scroll') as HTMLElement;
        const scrollLeft = scrollElement?.scrollLeft || 0;
        
        // Get position relative to the scroll container (not wrapper)
        const scrollRect = scrollElement.getBoundingClientRect();
        
        // Use wrapper.scrollWidth (total scrollable width with zoom)
        const totalWidth = wrapper.scrollWidth;
        
        // Position relative to scroll container + scroll offset
        const relativeX = (e.clientX - scrollRect.left) + scrollLeft;
        const percent = (relativeX / totalWidth) * 100;
        const calculatedTime = (percent / 100) * duration;
        
        console.log('🔍 getTimeFromEvent:', {
            clientX: e.clientX,
            scrollRectLeft: scrollRect.left.toFixed(1),
            scrollLeft,
            relativeX: relativeX.toFixed(1),
            totalWidth,
            percent: percent.toFixed(2),
            time: calculatedTime.toFixed(2),
            duration
        });
        
        return calculatedTime;
    };

    // Update cursor based on hover
    const updateCursor = (e: PointerEvent) => {
        if (isDragging) return;

        const time = getTimeFromEvent(e);
        const markerId = findMarkerAtTime(time);

        if (markerId !== hoveredMarkerId) {
            hoveredMarkerId = markerId;
            editLayer.style.cursor = markerId ? 'ew-resize' : 'crosshair';
        }
    };

    // Pointer events
    editLayer.addEventListener('pointerdown', (e: PointerEvent) => {
        e.preventDefault();
        const time = getTimeFromEvent(e);

        const markerId = findMarkerAtTime(time);

        if (markerId) {
            console.log(`🎯 Dragging existing marker: ${markerId}`);
            draggedMarkerId = markerId;
            dragStartTime = time;
            isDragging = true;
            isDraggingRef.current = true;
            editLayer.setPointerCapture(e.pointerId);
        } else {
            console.log(`🖱️ Start at ${time.toFixed(2)}s (new marker/loop)`);
            dragStartTime = time;
            isDragging = true;
            isDraggingRef.current = true;
            editLayer.setPointerCapture(e.pointerId);
        }
    });

    editLayer.addEventListener('pointermove', (e: PointerEvent) => {
        updateCursor(e);

        if (!isDragging || dragStartTime === null) return;

        const currentTime = getTimeFromEvent(e);

        // If dragging existing marker, just move the visual element
        if (draggedMarkerId) {
            const markerElement = wrapper.querySelector(`[data-loop-marker="${draggedMarkerId}"]`) as HTMLElement;
            if (markerElement) {
                const leftPercent = (currentTime / duration) * 100;
                markerElement.style.left = `${leftPercent}%`;
            }
            return;
        }

        // Otherwise show preview for new loop
        if (!previewDiv) {
            const primaryColor = theme.palette.primary.light;
            const hexToRgb = (hex: string) => {
                const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                return result ? {
                    r: parseInt(result[1], 16),
                    g: parseInt(result[2], 16),
                    b: parseInt(result[3], 16)
                } : {r: 25, g: 118, b: 210};
            };
            const primaryRgb = hexToRgb(primaryColor);

            previewDiv = document.createElement('div');
            previewDiv.setAttribute('data-preview', 'true');
            previewDiv.style.position = 'absolute';
            previewDiv.style.top = '0';
            previewDiv.style.bottom = '0';
            previewDiv.style.backgroundColor = `rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, 0.15)`;
            previewDiv.style.border = `2px dashed ${primaryColor}`;
            previewDiv.style.borderRadius = '8px';
            previewDiv.style.zIndex = '50';
            previewDiv.style.pointerEvents = 'none';
            wrapper.appendChild(previewDiv);
        }

        const start = Math.min(dragStartTime, currentTime);
        const end = Math.max(dragStartTime, currentTime);
        const startPercent = (start / duration) * 100;
        const widthPercent = ((end - start) / duration) * 100;

        previewDiv.style.left = `${startPercent}%`;
        previewDiv.style.width = `${widthPercent}%`;
    });

    editLayer.addEventListener('pointerup', (e: PointerEvent) => {
        if (!isDragging || dragStartTime === null) return;

        const endTime = getTimeFromEvent(e);
        const distance = Math.abs(endTime - dragStartTime);

        if (previewDiv) {
            previewDiv.remove();
            previewDiv = null;
        }

        // If we were dragging a marker, update the store NOW
        if (draggedMarkerId) {
            console.log(`✅ Marker ${draggedMarkerId} moved to ${endTime.toFixed(2)}s`);
            useAudioStore.getState().updateMarkerTime(draggedMarkerId, endTime);
            draggedMarkerId = null;
            isDragging = false;
            dragStartTime = null;
            isDraggingRef.current = false;
            return;
        }

        console.log(`🖱️ End: distance = ${distance.toFixed(2)}s`);

        // Create marker or loop
        if (distance < 0.5) {
            console.log('📍 Creating single marker');
            useAudioStore.getState().addMarker(dragStartTime);
        } else {
            console.log('🔁 Creating loop');
            const start = Math.min(dragStartTime, endTime);
            const end = Math.max(dragStartTime, endTime);

            const startMarkerId = useAudioStore.getState().addMarker(start);
            const endMarkerId = useAudioStore.getState().addMarker(end);

            useAudioStore.getState().createLoop(startMarkerId, endMarkerId);
        }

        isDragging = false;
        dragStartTime = null;
        isDraggingRef.current = false;
    });

    editLayer.addEventListener('pointercancel', () => {
        if (previewDiv) {
            previewDiv.remove();
            previewDiv = null;
        }
        isDragging = false;
        dragStartTime = null;
        draggedMarkerId = null;
        isDraggingRef.current = false;
    });

    wrapper.appendChild(editLayer);
};
