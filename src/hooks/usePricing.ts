import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PricingService } from '@/services/pricingService'
import {
  ProductPricing,
  PriceCalculationResult,
  CreateStockPricingRequest,
  CreateBonusPricingRequest,
  StockPricing,
  BonusPricing
} from '@/types/pricing'

export function useProductPricing(productId: string) {
  return useQuery({
    queryKey: ['product-pricing', productId],
    queryFn: () => PricingService.getProductPricing(productId),
    enabled: !!productId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

export function usePriceCalculation(
  basePrice: number,
  currentStock: number,
  quantity: number,
  stockPricings: StockPricing[],
  bonusPricings: BonusPricing[]
) {
  return useMemo(() => {
    return PricingService.calculatePrice(
      basePrice,
      currentStock,
      quantity,
      stockPricings,
      bonusPricings
    )
  }, [basePrice, currentStock, quantity, stockPricings, bonusPricings])
}

export function usePricingMutations() {
  const queryClient = useQueryClient()

  const createStockPricing = useMutation({
    mutationFn: (request: CreateStockPricingRequest) =>
      PricingService.createStockPricing(request),
    onSuccess: (data, variables) => {
      if (data) {
        queryClient.invalidateQueries({ 
          queryKey: ['product-pricing', variables.productId] 
        })
      }
    },
  })

  const createBonusPricing = useMutation({
    mutationFn: (request: CreateBonusPricingRequest) =>
      PricingService.createBonusPricing(request),
    onSuccess: (data, variables) => {
      if (data) {
        queryClient.invalidateQueries({ 
          queryKey: ['product-pricing', variables.productId] 
        })
      }
    },
  })

  const deleteStockPricing = useMutation({
    mutationFn: ({ id, productId }: { id: string; productId: string }) =>
      PricingService.deleteStockPricing(id),
    onSuccess: (success, variables) => {
      if (success) {
        queryClient.invalidateQueries({ 
          queryKey: ['product-pricing', variables.productId] 
        })
      }
    },
  })

  const deleteBonusPricing = useMutation({
    mutationFn: ({ id, productId }: { id: string; productId: string }) =>
      PricingService.deleteBonusPricing(id),
    onSuccess: (success, variables) => {
      if (success) {
        queryClient.invalidateQueries({ 
          queryKey: ['product-pricing', variables.productId] 
        })
      }
    },
  })

  return {
    createStockPricing,
    createBonusPricing,
    deleteStockPricing,
    deleteBonusPricing,
  }
}

import { useMemo } from 'react'