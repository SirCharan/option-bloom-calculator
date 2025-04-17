import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import { Calculator, Clock, Calendar, Info, Sparkles } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  calculateOptionPremium,
  calculateGreeks,
  dateToTimeToExpiry,
  durationToTimeToExpiry,
} from "@/utils/blackScholes";
import { greekDescriptions } from "@/utils/greekDescriptions";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { PayoffGraph } from './PayoffGraph';
import { track } from '@vercel/analytics';

interface DVOLResponse {
  volatility: number;
  timestamp: number;
}

export const OptionCalculator = () => {
  const isMobile = useIsMobile();
  
  // Form state
  const [selectedAsset, setSelectedAsset] = useState<"SELECT" | "BTC" | "ETH" | "SOL" | "ADA" | "MATIC" | "BASE" | "ARB">("SELECT");
  const [spotPrice, setSpotPrice] = useState<number>(100);
  const [strikePrice, setStrikePrice] = useState<number>(100);
  const [volatility, setVolatility] = useState<number>(100);
  const [useDVOL, setUseDVOL] = useState<boolean>(false);
  const [dvolData, setDvolData] = useState<{ btc: number | null; eth: number | null }>({ btc: null, eth: null });
  const [dvolWs, setDvolWs] = useState<WebSocket | null>(null);
  const [riskFreeRate, setRiskFreeRate] = useState<number>(0);
  const [optionType, setOptionType] = useState<"call" | "put">("call");
  const [timeMethod, setTimeMethod] = useState<"date" | "duration">("date");
  
  // Date expiry state
  const [expiryDate, setExpiryDate] = useState<Date>(() => {
    const date = new Date();
    date.setDate(date.getDate() + 30); // Default to 30 days in the future
    return date;
  });
  const [expiryHour, setExpiryHour] = useState<string>("16");
  const [expiryMinute, setExpiryMinute] = useState<string>("00");
  
  // Duration expiry state
  const [hours, setHours] = useState<number>(0);
  const [minutes, setMinutes] = useState<number>(0);
  const [seconds, setSeconds] = useState<number>(0);
  
  // Calculation results
  const [premium, setPremium] = useState<number>(0);
  const [greeks, setGreeks] = useState({
    delta: 0,
    gamma: 0,
    theta: 0,
    vega: 0,
    rho: 0
  });
  
  // Animation states
  const [animatePremium, setAnimatePremium] = useState(false);
  
  // Get CoinGecko ID for asset
  const getAssetId = (asset: string) => {
    const assetMap: { [key: string]: string } = {
      BTC: "bitcoin",
      ETH: "ethereum",
      SOL: "solana",
      ADA: "cardano",
      MATIC: "matic-network",
      BASE: "coinbase-wrapped-staked-eth",
      ARB: "arbitrum"
    };
    return assetMap[asset];
  };

  // Get display name for asset
  const getAssetDisplayName = (asset: string) => {
    const displayNames: { [key: string]: string } = {
      BTC: "Bitcoin (BTC)",
      ETH: "Ethereum (ETH)",
      SOL: "Solana (SOL)",
      ADA: "Cardano (ADA)",
      MATIC: "Polygon (MATIC)",
      BASE: "Base (BASE)",
      ARB: "Arbitrum (ARB)"
    };
    return displayNames[asset];
  };

  // Fetch price from CoinGecko
  const fetchAssetPrice = async (asset: string) => {
    try {
      const assetId = getAssetId(asset);
      console.log('Fetching price for:', assetId);
      
      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${assetId}&vs_currencies=usd`,
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          }
        }
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', errorText);
        throw new Error(`Failed to fetch price: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Received data:', data);
      
      if (!data[assetId]?.usd) {
        throw new Error('Invalid price data received');
      }
      
      const price = data[assetId].usd;
      console.log('Setting new price:', price);
      setSpotPrice(price);
      setStrikePrice(price); // Set strike price equal to spot price
      toast.success(`Updated ${getAssetDisplayName(asset)} price to $${price.toLocaleString()}`);
    } catch (error) {
      console.error('Error fetching price:', error);
      toast.error(`Failed to fetch ${asset} price: ${error.message}`);
    }
  };

  // Update price when asset changes
  useEffect(() => {
    console.log('Asset changed to:', selectedAsset);
    if (selectedAsset !== "SELECT") {
      fetchAssetPrice(selectedAsset);
      if (!useDVOL) {
        setVolatility(100); // Set to 100 instead of 0
      }
    }
  }, [selectedAsset]);
  
  // WebSocket connection for DVOL data
  const fetchDVOLData = async (asset: string): Promise<DVOLResponse> => {
    try {
      const ws = new WebSocket('wss://www.deribit.com/ws/api/v2');
      
      return new Promise((resolve, reject) => {
        ws.onopen = () => {
          console.log('WebSocket Connected');
          const msg = {
            jsonrpc: "2.0",
            id: 7617,
            method: "public/get_historical_volatility",
            params: {
              currency: asset.toUpperCase()
            }
          };
          console.log('Sending request:', msg); // Debug log
          ws.send(JSON.stringify(msg));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('WebSocket response:', data);
            
            if (data.result && Array.isArray(data.result) && data.result.length > 0) {
              // Get the most recent volatility value and truncate to 2 decimal places
              const latestVolatility = Number(data.result[data.result.length - 1][1].toFixed(2));
              resolve({
                volatility: latestVolatility,
                timestamp: Date.now()
              });
            } else if (data.error) {
              reject(new Error(data.error.message));
            } else {
              reject(new Error('Invalid response format'));
            }
            ws.close();
          } catch (error) {
            console.error('WebSocket message error:', error);
            reject(error);
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        };

        // Close connection if no response within 5 seconds
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.close();
            reject(new Error('WebSocket timeout'));
          }
        }, 5000);
      });
    } catch (error) {
      console.error('DVOL fetch error:', error);
      throw error;
    }
  };

  // Update display component
  const getDVOLDisplay = () => {
    if (!selectedAsset || !(selectedAsset === 'BTC' || selectedAsset === 'ETH')) {
      return <span className="italic">N/A</span>;
    }

    const value = dvolData[selectedAsset.toLowerCase() as 'btc' | 'eth'];
    if (value === null || value === undefined) {
      return <span className="italic">Loading...</span>;
    }

    return (
      <span className="font-medium text-groww-blue">
        {Number(value).toFixed(2)}%
      </span>
    );
  };
  
  // Fetch DVOL data periodically
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const updateDVOL = async () => {
      if (useDVOL && (selectedAsset === 'BTC' || selectedAsset === 'ETH')) {
        try {
          const result = await fetchDVOLData(selectedAsset);
          console.log('DVOL result:', result);
          
          setDvolData(prev => ({
            ...prev,
            [selectedAsset.toLowerCase()]: result.volatility
          }));

          if (useDVOL) {
            setVolatility(result.volatility);
          }
        } catch (error) {
          console.error('Error updating DVOL:', error);
          toast.error('Failed to fetch DVOL data');
        }
      }
    };

    // Initial fetch
    if (useDVOL && (selectedAsset === 'BTC' || selectedAsset === 'ETH')) {
      updateDVOL();
      // Update every 30 seconds
      intervalId = setInterval(updateDVOL, 30000);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [selectedAsset, useDVOL]);
  
  // Track asset selection
  const handleAssetSelection = (value: typeof selectedAsset) => {
    setSelectedAsset(value);
    if (value !== "SELECT") {
      track('asset_selected', { asset: value });
      // Reset DVOL and set default volatility for non-BTC/ETH assets
      if (value !== 'BTC' && value !== 'ETH') {
        setUseDVOL(false);
        setVolatility(100);
      }
      fetchAssetPrice(value);
    }
  };

  // Track option type changes
  const handleOptionTypeChange = (value: "call" | "put") => {
    setOptionType(value);
    track('option_type_changed', { type: value });
  };

  // Track time method changes
  const handleTimeMethodChange = (value: "date" | "duration") => {
    setTimeMethod(value as "date" | "duration");
    track('time_method_changed', { method: value });
  };

  // Track quick time selections
  const handleQuickTimeSelect = (duration: string) => {
    track('quick_time_selected', { duration });
    
    const date = new Date();
    switch (duration) {
      case '1h':
        date.setHours(date.getHours() + 1);
        break;
      case '1d':
        date.setDate(date.getDate() + 1);
        break;
      case '1w':
        date.setDate(date.getDate() + 7);
        break;
      case '1m':
        date.setMonth(date.getMonth() + 1);
        break;
      case '3m':
        date.setMonth(date.getMonth() + 3);
        break;
      case '1y':
        date.setFullYear(date.getFullYear() + 1);
        break;
    }
    setExpiryDate(date);
    setExpiryHour(date.getHours().toString().padStart(2, "0"));
    setExpiryMinute(date.getMinutes().toString().padStart(2, "0"));
    setTimeMethod("date");
  };

  // Handle calculations
  useEffect(() => {
    try {
      let timeToExpiry: number;
      
      if (timeMethod === "date") {
        // Create a date object with the selected date and time
        const expiryDateTime = new Date(expiryDate);
        expiryDateTime.setHours(parseInt(expiryHour), parseInt(expiryMinute), 0);
        timeToExpiry = dateToTimeToExpiry(expiryDateTime);
      } else {
        timeToExpiry = durationToTimeToExpiry(hours, minutes, seconds);
      }
      
      // Validate inputs
      if (
        spotPrice <= 0 ||
        strikePrice <= 0 ||
        volatility <= 0 ||
        timeToExpiry <= 0
      ) {
        return; // Don't calculate with invalid inputs
      }
      
      // Convert percentage inputs to decimals for calculation
      const volatilityDecimal = volatility / 100;
      const riskFreeRateDecimal = riskFreeRate / 100;
      
      // Calculate option premium
      const optionPremium = calculateOptionPremium(
        spotPrice,
        strikePrice,
        timeToExpiry,
        volatilityDecimal,
        riskFreeRateDecimal,
        optionType === "call"
      );
      
      // Calculate Greeks
      const optionGreeks = calculateGreeks(
        spotPrice,
        strikePrice,
        timeToExpiry,
        volatilityDecimal,
        riskFreeRateDecimal,
        optionType === "call"
      );
      
      // Trigger animation effect
      setAnimatePremium(true);
      
      // Update state with calculation results
      setPremium(optionPremium);
      setGreeks(optionGreeks);
      
      // Reset animation state after animation completes
      setTimeout(() => {
        setAnimatePremium(false);
      }, 300);

      // Track premium calculations
      if (
        spotPrice > 0 &&
        strikePrice > 0 &&
        volatility > 0 &&
        timeToExpiry > 0
      ) {
        track('premium_calculated', {
          asset: selectedAsset,
          option_type: optionType,
          time_method: timeMethod,
          premium_percentage: (optionPremium / spotPrice * 100).toFixed(2)
        });
      }
    } catch (error) {
      console.error("Calculation error:", error);
      toast.error("Error calculating option values. Please check your inputs.");
    }
  }, [
    spotPrice,
    strikePrice,
    volatility,
    riskFreeRate,
    optionType,
    timeMethod,
    expiryDate,
    expiryHour,
    expiryMinute,
    hours,
    minutes,
    seconds
  ]);
  
  // Generate time options for select components
  const hourOptions = Array.from({ length: 24 }, (_, i) => 
    i.toString().padStart(2, "0")
  );
  
  const minuteOptions = Array.from({ length: 60 }, (_, i) => 
    i.toString().padStart(2, "0")
  );
  
  // Validate and update numeric input
  const handleNumericInput = (
    value: string,
    setter: React.Dispatch<React.SetStateAction<number>>,
    min: number = 0
  ) => {
    const parsed = parseFloat(value);
    if (!isNaN(parsed) && parsed >= min) {
      setter(parsed);
    } else if (value === "") {
      setter(0); // Allow clearing input
    }
  };
  
  return (
    <div className="w-full max-w-4xl mx-auto animate-fade-in p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 mb-4 sm:mb-6">
        <div className="flex items-center gap-2">
          <Calculator className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          <h1 className="text-lg sm:text-2xl font-bold text-foreground">Options Calculator</h1>
        </div>
        
        <div className="flex items-center gap-2 text-xs sm:text-sm">
          <Sparkles className="h-3 w-3 sm:h-4 sm:w-4 text-primary animate-pulse-slow" />
          <div className="flex flex-col">
            <span className="text-muted-foreground">Powered by Black-Scholes</span>
            <span className="text-muted-foreground">Built for humans</span>
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 mb-6">
        {/* Input Section */}
        <div className="col-span-1 lg:col-span-2 space-y-4 md:space-y-6">
          <Card className="grecian-blur">
            <CardHeader className="pb-2 sm:pb-3">
              <CardTitle className="text-base sm:text-lg font-semibold text-foreground">Option Parameters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {/* Asset Selector */}
                <div className="option-input-group">
                  <Label htmlFor="asset" className="option-label">
                    Asset
                  </Label>
                  <Select
                    value={selectedAsset}
                    onValueChange={handleAssetSelection}
                  >
                    <SelectTrigger className="transition-all duration-200 hover:border-primary text-sm sm:text-base">
                      <SelectValue placeholder="Select asset" />
                    </SelectTrigger>
                    <SelectContent className="animate-scale">
                      <SelectItem value="SELECT">Select</SelectItem>
                      <SelectItem value="BTC">Bitcoin (BTC)</SelectItem>
                      <SelectItem value="ETH">Ethereum (ETH)</SelectItem>
                      <SelectItem value="SOL">Solana (SOL)</SelectItem>
                      <SelectItem value="ADA">Cardano (ADA)</SelectItem>
                      <SelectItem value="MATIC">Polygon (MATIC)</SelectItem>
                      <SelectItem value="BASE">Base (BASE)</SelectItem>
                      <SelectItem value="ARB">Arbitrum (ARB)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Spot Price */}
                <div className="option-input-group">
                  <Label htmlFor="spotPrice" className="option-label">
                    Current Price ($)
                  </Label>
                  <Input
                    id="spotPrice"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="1000000"
                    value={spotPrice}
                    onChange={(e) => 
                      handleNumericInput(e.target.value, setSpotPrice, 0.01)
                    }
                    className="text-sm sm:text-base transition-all duration-200 hover:border-primary focus:border-primary"
                  />
                </div>
                
                {/* Strike Price */}
                <div className="option-input-group">
                  <Label htmlFor="strikePrice" className="option-label">
                    Strike Price ($)
                  </Label>
                  <Input
                    id="strikePrice"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="1000000"
                    value={strikePrice}
                    onChange={(e) => 
                      handleNumericInput(e.target.value, setStrikePrice, 0.01)
                    }
                    className="text-sm sm:text-base transition-all duration-200 hover:border-primary focus:border-primary"
                  />
                </div>
                
                {/* Option Type */}
                <div className="option-input-group">
                  <Label className="option-label">Option Type</Label>
                  <ToggleGroup
                    type="single"
                    value={optionType}
                    onValueChange={(value) => value && handleOptionTypeChange(value as "call" | "put")}
                    className="justify-start"
                  >
                    <ToggleGroupItem 
                      value="call" 
                      className={cn(
                        "transition-all duration-200 text-sm sm:text-base",
                        optionType === "call" ? "bg-primary text-primary-foreground animate-scale" : ""
                      )}
                    >
                      Call
                    </ToggleGroupItem>
                    <ToggleGroupItem 
                      value="put"
                      className={cn(
                        "transition-all duration-200 text-sm sm:text-base",
                        optionType === "put" ? "bg-primary text-primary-foreground animate-scale" : ""
                      )}
                    >
                      Put
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
                
                {/* Implied Volatility */}
                <div className="option-input-group">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <Label htmlFor="volatility" className="option-label">
                        Implied Volatility (%)
                      </Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground hover:text-primary transition-colors duration-200" />
                          </TooltipTrigger>
                          <TooltipContent className="animate-scale">
                            <p className="max-w-xs text-xs">
                              Implied volatility represents the expected volatility of the underlying asset.
                              Typically ranges from 10% to 100% for most assets.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    {(selectedAsset === 'BTC' || selectedAsset === 'ETH') && (
                      <div className="flex items-center gap-2">
                        <Label htmlFor="useDVOL" className="text-xs text-muted-foreground">
                          Use DVOL
                        </Label>
                        <ToggleGroup
                          type="single"
                          value={useDVOL ? "on" : "off"}
                          onValueChange={(value) => setUseDVOL(value === "on")}
                          className="h-5 sm:h-6"
                        >
                          <ToggleGroupItem 
                            value="on" 
                            className={cn(
                              "h-5 sm:h-6 px-2 text-xs",
                              useDVOL ? "bg-primary text-primary-foreground" : ""
                            )}
                          >
                            On
                          </ToggleGroupItem>
                          <ToggleGroupItem 
                            value="off"
                            className={cn(
                              "h-5 sm:h-6 px-2 text-xs",
                              !useDVOL ? "bg-primary text-primary-foreground" : ""
                            )}
                          >
                            Off
                          </ToggleGroupItem>
                        </ToggleGroup>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      id="volatility"
                      type="number"
                      step="any"
                      max="1000"
                      value={volatility || ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === '') {
                          setVolatility(0);
                        } else {
                          const parsed = parseFloat(value);
                          if (!isNaN(parsed) && parsed <= 1000) {
                            setVolatility(parsed);
                          }
                        }
                      }}
                      disabled={useDVOL && (selectedAsset === 'BTC' || selectedAsset === 'ETH')}
                      className={cn(
                        "text-sm sm:text-base transition-all duration-200 hover:border-primary focus:border-primary",
                        useDVOL && (selectedAsset === 'BTC' || selectedAsset === 'ETH') && "opacity-50"
                      )}
                    />
                    {useDVOL && (selectedAsset === 'BTC' || selectedAsset === 'ETH') && (
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <span>DVOL:</span>
                        {getDVOLDisplay()}
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Risk-Free Rate */}
                <div className="option-input-group">
                  <div className="flex items-center gap-1">
                    <Label htmlFor="riskFreeRate" className="option-label">
                      Risk-Free Rate (%)
                    </Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground hover:text-primary transition-colors duration-200" />
                        </TooltipTrigger>
                        <TooltipContent className="animate-scale">
                          <p className="max-w-xs text-xs">
                            The risk-free interest rate, typically based on government bond yields.
                            Usually between 1% and 10%.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    id="riskFreeRate"
                    type="number"
                    step="0.01"
                    min="0"
                    value={riskFreeRate}
                    onChange={(e) => 
                      handleNumericInput(e.target.value, setRiskFreeRate)
                    }
                    className="text-sm sm:text-base transition-all duration-200 hover:border-primary focus:border-primary"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Time to Expiry Section */}
          <Card className="grecian-blur">
            <CardHeader className="pb-2 sm:pb-3">
              <CardTitle className="text-base sm:text-lg font-semibold text-foreground">Time to Expiry</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <Label className="option-label mb-2 block">Quick Select</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuickTimeSelect('1h')}
                    className="transition-all duration-200 hover:border-primary text-xs sm:text-sm"
                  >
                    1 Hour
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuickTimeSelect('1d')}
                    className="transition-all duration-200 hover:border-primary text-xs sm:text-sm"
                  >
                    1 Day
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuickTimeSelect('1w')}
                    className="transition-all duration-200 hover:border-primary text-xs sm:text-sm"
                  >
                    1 Week
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuickTimeSelect('1m')}
                    className="transition-all duration-200 hover:border-primary text-xs sm:text-sm"
                  >
                    1 Month
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuickTimeSelect('3m')}
                    className="transition-all duration-200 hover:border-primary text-xs sm:text-sm"
                  >
                    3 Months
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuickTimeSelect('1y')}
                    className="transition-all duration-200 hover:border-primary text-xs sm:text-sm"
                  >
                    1 Year
                  </Button>
                </div>
              </div>
              <Tabs
                defaultValue="date"
                value={timeMethod}
                onValueChange={handleTimeMethodChange}
              >
                <TabsList className="mb-4">
                  <TabsTrigger value="date" className="flex items-center gap-1.5 transition-all duration-200 text-xs sm:text-sm">
                    <Calendar className="h-3 w-3 sm:h-4 sm:w-4" />
                    <span>Expiry Date</span>
                  </TabsTrigger>
                  <TabsTrigger value="duration" className="flex items-center gap-1.5 transition-all duration-200 text-xs sm:text-sm">
                    <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
                    <span>Duration</span>
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="date" className="mt-0 animate-fade-in">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <Label htmlFor="expiryDate" className="option-label">
                        Expiry Date
                      </Label>
                      <div className="mt-1.5">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className="w-full justify-start text-left font-normal transition-all duration-200 hover:border-primary text-sm sm:text-base"
                            >
                              <Calendar className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                              {expiryDate ? (
                                format(expiryDate, "PPP")
                              ) : (
                                <span>Pick a date</span>
                              )}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0 animate-scale" align="start">
                            <CalendarComponent
                              mode="single"
                              selected={expiryDate}
                              onSelect={(date) => date && setExpiryDate(date)}
                              initialFocus
                              disabled={(date) => date < new Date()}
                              className={cn("p-3")}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                    
                    <div>
                      <Label className="option-label">Expiry Time</Label>
                      <div className="grid grid-cols-2 gap-2 mt-1.5">
                        <Select
                          value={expiryHour}
                          onValueChange={setExpiryHour}
                        >
                          <SelectTrigger className="transition-all duration-200 hover:border-primary text-sm sm:text-base">
                            <SelectValue placeholder="Hour" />
                          </SelectTrigger>
                          <SelectContent className="animate-scale">
                            {hourOptions.map((hour) => (
                              <SelectItem key={hour} value={hour}>
                                {hour}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        
                        <Select
                          value={expiryMinute}
                          onValueChange={setExpiryMinute}
                        >
                          <SelectTrigger className="transition-all duration-200 hover:border-primary text-sm sm:text-base">
                            <SelectValue placeholder="Min" />
                          </SelectTrigger>
                          <SelectContent className="animate-scale">
                            {minuteOptions.map((minute) => (
                              <SelectItem key={minute} value={minute}>
                                {minute}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="duration" className="mt-0 animate-fade-in">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="option-input-group">
                      <Label htmlFor="hours" className="option-label">
                        Hours
                      </Label>
                      <Input
                        id="hours"
                        type="number"
                        min="0"
                        value={hours}
                        onChange={(e) => 
                          handleNumericInput(e.target.value, setHours)
                        }
                        className="text-sm sm:text-base transition-all duration-200 hover:border-primary focus:border-primary"
                      />
                    </div>
                    
                    <div className="option-input-group">
                      <Label htmlFor="minutes" className="option-label">
                        Minutes
                      </Label>
                      <Input
                        id="minutes"
                        type="number"
                        min="0"
                        max="59"
                        value={minutes}
                        onChange={(e) => 
                          handleNumericInput(e.target.value, setMinutes)
                        }
                        className="text-sm sm:text-base transition-all duration-200 hover:border-primary focus:border-primary"
                      />
                    </div>
                    
                    <div className="option-input-group">
                      <Label htmlFor="seconds" className="option-label">
                        Seconds
                      </Label>
                      <Input
                        id="seconds"
                        type="number"
                        min="0"
                        max="59"
                        value={seconds}
                        onChange={(e) => 
                          handleNumericInput(e.target.value, setSeconds)
                        }
                        className="text-sm sm:text-base transition-all duration-200 hover:border-primary focus:border-primary"
                      />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
        
        {/* Results Section */}
        <div className="col-span-1 space-y-4">
          <Card className="grecian-blur">
            <CardHeader className="pb-2 sm:pb-3">
              <CardTitle className="text-base sm:text-lg font-semibold text-foreground">Option Premium</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={cn(
                "text-xl sm:text-3xl font-bold text-primary transition-all duration-200",
                animatePremium && "animate-scale"
              )}>
                ${premium.toFixed(2)}
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                {optionType === "call" ? "Call" : "Put"} option price
              </p>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                ({(premium / spotPrice * 100).toFixed(2)}% of asset price)
              </p>
            </CardContent>
          </Card>
          
          <Card className="grecian-blur">
            <CardHeader className="pb-2 sm:pb-3">
              <CardTitle className="text-base sm:text-lg font-semibold text-foreground">Greeks</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 sm:space-y-3">
                {Object.entries(greeks).map(([key, value]) => (
                  <div key={key} className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-2 cursor-help">
                              <span className="text-xs sm:text-sm font-medium capitalize">{key}</span>
                              <Info className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground hover:text-primary transition-colors duration-200" />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side={isMobile ? "top" : "right"} className="animate-scale">
                            <p className="max-w-xs text-xs">
                              {greekDescriptions[key as keyof typeof greekDescriptions]}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <span className={cn(
                      "font-medium transition-all duration-200 text-xs sm:text-sm",
                      animatePremium && "animate-scale"
                    )}>
                      {value.toFixed(4)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Payoff Diagram Section - Full Width */}
      <Card className="grecian-blur w-full">
        <CardHeader className="pb-2 sm:pb-3">
          <CardTitle className="text-base sm:text-lg font-semibold text-foreground">Payoff Diagram</CardTitle>
        </CardHeader>
        <CardContent className="p-2 sm:p-4">
          <div className="w-full aspect-[4/3] sm:aspect-[16/9] lg:aspect-[2/1] rounded-lg overflow-hidden">
            <PayoffGraph
              spotPrice={spotPrice}
              strikePrice={strikePrice}
              premium={premium}
              optionType={optionType}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default OptionCalculator;
