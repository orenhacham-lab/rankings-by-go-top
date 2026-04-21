'use client'

import { useState } from 'react'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import Button from '@/components/ui/Button'
import { TrackingTarget, LocationMode } from '@/lib/supabase/types'
import {
  createTrackingTargetAction,
  updateTrackingTargetAction,
  createBulkTrackingTargetsAction,
} from '@/app/actions/tracking-targets'

interface TrackingTargetFormProps {
  target?: TrackingTarget
  projectId: string
  projectCity?: string | null
  projectCountry?: string
  defaultDomain?: string
  defaultBusinessName?: string
  onSuccess: () => void
  onCancel: () => void
}

export default function TrackingTargetForm({
  target,
  projectId,
  projectCity,
  projectCountry,
  defaultDomain,
  defaultBusinessName,
  onSuccess,
  onCancel,
}: TrackingTargetFormProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [engine, setEngine] = useState<'google_search' | 'google_maps'>(target?.engine_type || 'google_search')
  const [locationMode, setLocationMode] = useState<LocationMode>(
    target?.location_mode || 'project'
  )
  const [customCity, setCustomCity] = useState(target?.custom_city || '')
  const [postalCode, setPostalCode] = useState(target?.postal_code || '')
  const [radiusMiles, setRadiusMiles] = useState<string>(
    target?.radius_miles ? String(target.radius_miles) : '5'
  )
  const [bulkMode, setBulkMode] = useState(false)
  const [validationError, setValidationError] = useState('')

  // exact_point state — either address OR lat/lng, never both sources
  const initialExactSubMode: 'address' | 'coords' =
    target?.exact_resolution_source === 'user_provided_coordinates' ? 'coords' : 'address'
  const [exactSubMode, setExactSubMode] = useState<'address' | 'coords'>(initialExactSubMode)
  const [exactAddress, setExactAddress] = useState(target?.exact_address_input || '')
  const [exactLat, setExactLat] = useState<string>(
    target?.exact_resolved_lat != null ? String(target.exact_resolved_lat) : ''
  )
  const [exactLng, setExactLng] = useState<string>(
    target?.exact_resolved_lng != null ? String(target.exact_resolved_lng) : ''
  )

  // Validate US city format for custom city and project city
  const validateUSCityFormat = (city: string): boolean => {
    if (!city.trim()) return false
    // Format: "City, ST" where ST is 2-letter state code
    const pattern = /^[A-Za-z\s]+,\s?[A-Z]{2}$/
    return pattern.test(city.trim())
  }

  const customCityDiffers =
    locationMode === 'custom' &&
    customCity.trim() !== '' &&
    projectCity != null &&
    customCity.trim().toLowerCase() !== projectCity.toLowerCase()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setValidationError('')
    setSuccessMsg('')

    // Validate US city format if needed
    if (projectCountry?.toUpperCase() === 'US') {
      // Project city must be in "City, ST" format (not required for exact_point)
      if (locationMode !== 'exact_point' && (!projectCity || !validateUSCityFormat(projectCity))) {
        setError(`פרויקט ארה"ב חייב להגדיר עיר בפורמט: "עיר, קוד מדינה" (לדוגמה: "New York, NY")`)
        return
      }

      // Custom city must be in "City, ST" format if specified
      if (locationMode === 'custom' && customCity.trim()) {
        if (!validateUSCityFormat(customCity)) {
          setValidationError(`עיר מותאמת חייבת להיות בפורמט: "עיר, קוד מדינה" (לדוגמה: "Los Angeles, CA")`)
          return
        }
      }
    }

    // exact_point: client-side guardrail. Real blocking validation happens server-side.
    if (locationMode === 'exact_point') {
      if (exactSubMode === 'coords') {
        const lat = parseFloat(exactLat)
        const lng = parseFloat(exactLng)
        if (!Number.isFinite(lat) || !Number.isFinite(lng) ||
            lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          setValidationError('קואורדינטות לא תקינות: lat (-90..90), lng (-180..180)')
          return
        }
      } else {
        if (!exactAddress.trim()) {
          setValidationError('דרוש להזין כתובת מלאה עבור מצב "נקודה מדויקת"')
          return
        }
      }
    }

    setLoading(true)
    const formData = new FormData(e.currentTarget)

    try {
      if (target) {
        await updateTrackingTargetAction(target.id, formData)
        onSuccess()
      } else if (bulkMode) {
        const result = await createBulkTrackingTargetsAction(formData)
        const msg = `נוספו ${result.created} מילות מפתח${result.skipped > 0 ? ` (${result.skipped} כבר קיימות)` : ''}`
        setSuccessMsg(msg)
        setTimeout(() => onSuccess(), 1200)
      } else {
        await createTrackingTargetAction(formData)
        onSuccess()
      }
    } catch (err) {
      setError((err as Error).message || 'שגיאה בשמירה')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          {successMsg}
        </div>
      )}

      <input type="hidden" name="project_id" value={projectId} />

      {/* Bulk mode toggle — only when creating */}
      {!target && (
        <div className="flex gap-2 border-b border-slate-100 pb-3">
          <button
            type="button"
            onClick={() => setBulkMode(false)}
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
              !bulkMode
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            מילה בודדת
          </button>
          <button
            type="button"
            onClick={() => setBulkMode(true)}
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
              bulkMode
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            הוספה מרובה
          </button>
        </div>
      )}

      {bulkMode ? (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            מילות מפתח (שורה אחת לכל מילה) *
          </label>
          <textarea
            name="keywords"
            required
            rows={6}
            dir="rtl"
            placeholder={'קידום אתרים בפתח תקווה\nקידום אתרים בתל אביב\nקידום אתרים לעסקים קטנים'}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none font-['Rubik']"
          />
          <p className="text-xs text-slate-400 mt-1">
            הדבק מילות מפתח — שורה אחת לכל מילה. שורות ריקות ישוחו. כפולות תידלגנה.
          </p>
        </div>
      ) : (
        <Input
          label="מילת מפתח *"
          name="keyword"
          defaultValue={target?.keyword}
          required
          placeholder="קידום אתרים תל אביב"
        />
      )}

      <Select
        label="מנוע חיפוש *"
        name="engine_type"
        value={engine}
        onChange={(e) => setEngine(e.target.value as 'google_search' | 'google_maps')}
        options={[
          { value: 'google_search', label: 'גוגל חיפוש אורגני' },
          { value: 'google_maps', label: 'גוגל מפות' },
        ]}
      />

      {engine === 'google_search' && (
        <Input
          label="דומיין יעד"
          name="target_domain"
          defaultValue={target?.target_domain || defaultDomain || ''}
          placeholder="example.co.il"
          hint="הדומיין שמחפשים בתוצאות החיפוש"
        />
      )}

      {engine === 'google_maps' && (
        <Input
          label="שם עסק ביעד"
          name="target_business_name"
          defaultValue={target?.target_business_name || defaultBusinessName || ''}
          placeholder="שם העסק כפי שמופיע בגוגל מפות"
        />
      )}

      <Input
        label="דף נחיתה מועדף (אופציונלי)"
        name="preferred_landing_page"
        defaultValue={target?.preferred_landing_page || ''}
        placeholder="/שירותים/קידום-אתרים"
      />

      {/* Location Mode */}
      <div>
        <Select
          label="מצב מיקום"
          name="location_mode"
          value={locationMode}
          onChange={(e) => {
            const mode = e.target.value as LocationMode
            // Reset to 'project' if trying to select disabled ZIP mode
            if (mode === 'zip' && projectCountry?.toUpperCase() !== 'US') {
              return
            }
            setLocationMode(mode)
          }}
          options={[
            { value: 'project', label: `עיר הפרויקט${projectCity ? ` (${projectCity})` : ''}` },
            { value: 'custom', label: 'עיר מותאמת אישית' },
            ...(projectCountry?.toUpperCase() === 'US'
              ? [
                  { value: 'zip', label: 'ZIP Code (US Only)' },
                  { value: 'radius', label: 'Radius Scan (US Only)' },
                  { value: 'exact_point', label: 'נקודה מדויקת — כתובת / lat,lng (מדויק ביותר)' },
                ]
              : []),
          ]}
        />
        {projectCountry?.toUpperCase() !== 'US' && (
          <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-blue-800 text-xs">
            ZIP Code וגם נקודה מדויקת זמינים לפרויקטי ארה"ב בלבד
          </div>
        )}
      </div>

      {locationMode === 'custom' && (
        <div>
          <Input
            label="עיר מותאמת *"
            name="custom_city"
            value={customCity}
            onChange={(e) => {
              setCustomCity(e.target.value)
              setValidationError('')
            }}
            placeholder={projectCountry?.toUpperCase() === 'US' ? 'Los Angeles, CA' : 'תל אביב'}
            hint={projectCountry?.toUpperCase() === 'US' ? 'פורמט: "עיר, קוד מדינה" (לדוגמה: "New York, NY")' : ''}
            required
          />
          {validationError && (
            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">
              {validationError}
            </div>
          )}
          {customCityDiffers && (
            <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-amber-800 text-xs">
              הביטוי משתמש בעיר שונה מהעיר המוגדרת בפרויקט
            </div>
          )}
        </div>
      )}

      {locationMode === 'zip' && (
        <Input
          label="ZIP code *"
          name="postal_code"
          value={postalCode}
          onChange={(e) => {
            const val = e.target.value.replace(/\D/g, '').slice(0, 5)
            setPostalCode(val)
          }}
          required
          placeholder="12345"
          maxLength={5}
          pattern="\d{5}"
          hint="5-digit US ZIP code"
        />
      )}

      {locationMode === 'radius' && (
        <Select
          label="Radius *"
          name="radius_miles"
          value={radiusMiles}
          onChange={(e) => setRadiusMiles(e.target.value)}
          options={[
            { value: '3', label: '3 miles' },
            { value: '5', label: '5 miles' },
            { value: '10', label: '10 miles' },
          ]}
          required
        />
      )}

      {locationMode === 'exact_point' && (
        <div className="space-y-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
          <div className="text-sm text-slate-700 font-medium">
            נקודה מדויקת (source of truth לסריקה)
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setExactSubMode('address')
                setValidationError('')
              }}
              className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                exactSubMode === 'address'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              כתובת מלאה
            </button>
            <button
              type="button"
              onClick={() => {
                setExactSubMode('coords')
                setValidationError('')
              }}
              className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                exactSubMode === 'coords'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              קואורדינטות (lat, lng)
            </button>
          </div>

          {exactSubMode === 'address' ? (
            <Input
              label="כתובת מלאה *"
              name="exact_address_input"
              value={exactAddress}
              onChange={(e) => {
                setExactAddress(e.target.value)
                setValidationError('')
              }}
              placeholder={projectCountry?.toUpperCase() === 'US' ? '1600 Amphitheatre Pkwy, Mountain View, CA 94043' : 'רחוב ושם הרחוב, עיר'}
              hint="הכתובת תפתור אוטומטית ל-lat/lng בעת השמירה (Google → Nominatim fallback)"
              required
            />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Latitude *"
                name="exact_resolved_lat"
                type="number"
                step="0.000001"
                value={exactLat}
                onChange={(e) => {
                  setExactLat(e.target.value)
                  setValidationError('')
                }}
                placeholder="37.4220"
                required
              />
              <Input
                label="Longitude *"
                name="exact_resolved_lng"
                type="number"
                step="0.000001"
                value={exactLng}
                onChange={(e) => {
                  setExactLng(e.target.value)
                  setValidationError('')
                }}
                placeholder="-122.0841"
                required
              />
            </div>
          )}

          {validationError && (
            <div className="p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">
              {validationError}
            </div>
          )}

          <div className="text-xs text-slate-500">
            סריקה תשלח רק ll=@lat,lng,13z. אין נפילה לעיר או ZIP.
          </div>
        </div>
      )}

      <input type="hidden" name="grid_size" value="" />
      {locationMode === 'project' && (
        <input type="hidden" name="custom_city" value="" />
      )}
      {locationMode !== 'zip' && (
        <input type="hidden" name="postal_code" value="" />
      )}
      {locationMode !== 'exact_point' && (
        <>
          <input type="hidden" name="exact_address_input" value="" />
          <input type="hidden" name="exact_resolved_lat" value="" />
          <input type="hidden" name="exact_resolved_lng" value="" />
        </>
      )}
      {locationMode === 'exact_point' && exactSubMode === 'address' && (
        <>
          <input type="hidden" name="exact_resolved_lat" value="" />
          <input type="hidden" name="exact_resolved_lng" value="" />
        </>
      )}
      {locationMode === 'exact_point' && exactSubMode === 'coords' && (
        <input type="hidden" name="exact_address_input" value="" />
      )}

      <Textarea
        label="הערות"
        name="notes"
        defaultValue={target?.notes || ''}
        placeholder="הערות נוספות..."
        rows={2}
      />

      <div className="flex gap-3 pt-2">
        <Button type="submit" loading={loading}>
          {target ? 'שמור שינויים' : bulkMode ? 'הוסף מילות מפתח' : 'הוסף מילת מפתח'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          ביטול
        </Button>
      </div>
    </form>
  )
}
