'use client'

import * as maplibregl from 'maplibre-gl'
import { useEffect, useRef } from 'react'

export function LocationMap({
  latitude,
  longitude,
  interactive = false,
  className = 'h-44',
}: {
  latitude: number
  longitude: number
  interactive?: boolean
  className?: string
}) {
  const container = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!container.current) return
    const map = new maplibregl.Map({
      container: container.current,
      center: [longitude, latitude],
      zoom: 14,
      interactive,
      attributionControl: false,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
          },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
    })
    map.addControl(new maplibregl.AttributionControl({ compact: true }))
    new maplibregl.Marker({ color: '#6d5df0' })
      .setLngLat([longitude, latitude])
      .addTo(map)
    return () => map.remove()
  }, [interactive, latitude, longitude])
  return (
    <div
      ref={container}
      className={`${className} overflow-hidden rounded-xl`}
      aria-label={`Map showing ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`}
    />
  )
}
