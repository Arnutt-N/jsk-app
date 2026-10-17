'use client'

import { useCallback, useRef, useState } from 'react'

import type { District, Province, SubDistrict } from '../types/location'
import { fetchDistricts, fetchSubDistricts } from '@/lib/liff/location-cascade'
import { logger } from '@/lib/logger'

export interface LocationSelection {
  province: string
  district: string
  sub_district: string
}

/**
 * Province → district → sub-district cascade shared by the service-request
 * family (service-request, request-v2, service-request-single). Owns the
 * option lists, the selected ids, the spinners, and the stale-response
 * guards; the page owns the form names through `onSelectionChange`.
 */
export function useLocationCascade(
  onSelectionChange: (patch: Partial<LocationSelection>) => void,
) {
  const [districts, setDistricts] = useState<District[]>([])
  const [subDistricts, setSubDistricts] = useState<SubDistrict[]>([])
  const [loadingDistricts, setLoadingDistricts] = useState(false)
  const [loadingSubDistricts, setLoadingSubDistricts] = useState(false)
  const [selectedProvinceId, setSelectedProvinceId] = useState<number | null>(null)
  const [selectedDistrictId, setSelectedDistrictId] = useState<number | null>(null)
  const provinceReqRef = useRef<string | null>(null)
  const districtReqRef = useRef<string | null>(null)

  const selectProvince = useCallback(
    async (rawValue: string, provinces: Province[]) => {
      const provinceId = parseInt(rawValue)
      const provinceObj = provinces.find((p) => p.PROVINCE_ID === provinceId)
      setSelectedProvinceId(provinceId)
      setDistricts([])
      setSubDistricts([])
      setSelectedDistrictId(null)
      onSelectionChange({
        province: provinceObj?.PROVINCE_THAI ?? '',
        district: '',
        sub_district: '',
      })
      if (!provinceId) return
      setLoadingDistricts(true)
      const reqId = String(provinceId)
      provinceReqRef.current = reqId
      try {
        const data = await fetchDistricts(provinceId)
        if (provinceReqRef.current !== reqId) return
        setDistricts(data)
      } catch (err) {
        if (provinceReqRef.current !== reqId) return
        logger.error(err)
      } finally {
        if (provinceReqRef.current === reqId) setLoadingDistricts(false)
      }
    },
    [onSelectionChange],
  )

  const selectDistrict = useCallback(
    async (rawValue: string, districtList: District[]) => {
      const districtId = parseInt(rawValue)
      const districtObj = districtList.find((d) => d.DISTRICT_ID === districtId)
      setSelectedDistrictId(districtId)
      setSubDistricts([])
      onSelectionChange({
        district: districtObj?.DISTRICT_THAI ?? '',
        sub_district: '',
      })
      if (!districtId) return
      setLoadingSubDistricts(true)
      const reqId = String(districtId)
      districtReqRef.current = reqId
      try {
        const data = await fetchSubDistricts(districtId)
        if (districtReqRef.current !== reqId) return
        setSubDistricts(data)
      } catch (err) {
        if (districtReqRef.current !== reqId) return
        logger.error(err)
      } finally {
        if (districtReqRef.current === reqId) setLoadingSubDistricts(false)
      }
    },
    [onSelectionChange],
  )

  const selectSubDistrict = useCallback(
    (rawValue: string, subDistrictList: SubDistrict[]) => {
      const subDistrictId = parseInt(rawValue)
      const subObj = subDistrictList.find((s) => s.SUB_DISTRICT_ID === subDistrictId)
      onSelectionChange({ sub_district: subObj?.SUB_DISTRICT_THAI ?? '' })
    },
    [onSelectionChange],
  )

  const reset = useCallback(() => {
    setDistricts([])
    setSubDistricts([])
    setSelectedProvinceId(null)
    setSelectedDistrictId(null)
    provinceReqRef.current = null
    districtReqRef.current = null
  }, [])

  return {
    districts,
    subDistricts,
    loadingDistricts,
    loadingSubDistricts,
    selectedProvinceId,
    selectedDistrictId,
    selectProvince,
    selectDistrict,
    selectSubDistrict,
    reset,
  }
}

export type LocationCascade = ReturnType<typeof useLocationCascade>
