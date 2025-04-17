import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

interface PayoffGraphProps {
  spotPrice: number;
  strikePrice: number;
  premium: number;
  optionType: 'call' | 'put';
}

export const PayoffGraph: React.FC<PayoffGraphProps> = ({
  spotPrice,
  strikePrice,
  premium,
  optionType
}) => {
  // Generate data points for the graph
  const generateData = () => {
    const data = [];
    // Extend the range to show more of the payoff curve
    const minPrice = Math.max(0, strikePrice - spotPrice * 0.75);
    const maxPrice = strikePrice + spotPrice * 0.75;
    const step = (maxPrice - minPrice) / 100; // Increase data points for smoother curves

    for (let price = minPrice; price <= maxPrice; price += step) {
      let buyerPayoff = 0;
      let sellerPayoff = 0;

      if (optionType === 'call') {
        buyerPayoff = Math.max(0, price - strikePrice) - premium;
        sellerPayoff = premium - Math.max(0, price - strikePrice);
      } else {
        buyerPayoff = Math.max(0, strikePrice - price) - premium;
        sellerPayoff = premium - Math.max(0, strikePrice - price);
      }

      data.push({
        price: Number(price.toFixed(2)),
        buyerPayoff: Number(buyerPayoff.toFixed(2)),
        sellerPayoff: Number(sellerPayoff.toFixed(2))
      });
    }

    return data;
  };

  const data = generateData();

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3 rounded-lg shadow-lg">
          <p className="text-gray-600 dark:text-gray-300 font-medium mb-2 text-xs sm:text-sm">
            Asset Price: ${Number(label).toLocaleString()}
          </p>
          <p className="text-emerald-600 font-medium mb-1 text-xs sm:text-sm">
            Buyer Payoff: ${payload[0].value.toLocaleString()}
          </p>
          <p className="text-red-600 font-medium text-xs sm:text-sm">
            Seller Payoff: ${payload[1].value.toLocaleString()}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={data}
        margin={{
          top: 10,
          right: 10,
          left: 10,
          bottom: 10,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
        <XAxis 
          dataKey="price" 
          label={{ 
            value: 'Asset Price ($)', 
            position: 'insideBottom', 
            offset: -5,
            style: { 
              textAnchor: 'middle',
              fontSize: '12px',
              fill: '#6B7280'
            }
          }}
          tickFormatter={(value) => `$${value}`}
          stroke="#6B7280"
          tick={{ fontSize: 11 }}
          tickMargin={5}
        />
        <YAxis 
          label={{ 
            value: 'Payoff ($)', 
            angle: -90, 
            position: 'insideLeft',
            offset: 0,
            style: { 
              textAnchor: 'middle',
              fontSize: '12px',
              fill: '#6B7280'
            }
          }}
          tickFormatter={(value) => `$${value}`}
          stroke="#6B7280"
          tick={{ fontSize: 11 }}
          tickMargin={5}
        />
        <Tooltip 
          content={<CustomTooltip />}
          cursor={{ stroke: '#6B7280', strokeWidth: 1 }}
        />
        <Legend 
          verticalAlign="top" 
          height={36}
          wrapperStyle={{
            paddingTop: '5px',
            fontSize: '12px'
          }}
        />
        <Line
          type="monotone"
          dataKey="buyerPayoff"
          stroke="#22c55e"
          name="Buyer Payoff"
          dot={false}
          strokeWidth={2}
          activeDot={{ r: 6, stroke: '#15803d', strokeWidth: 2 }}
        />
        <Line
          type="monotone"
          dataKey="sellerPayoff"
          stroke="#ef4444"
          name="Seller Payoff"
          dot={false}
          strokeWidth={2}
          activeDot={{ r: 6, stroke: '#b91c1c', strokeWidth: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}; 