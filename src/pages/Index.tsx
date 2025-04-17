
import React from "react";
import OptionCalculator from "@/components/OptionCalculator";
import { ThemeToggle } from "@/components/ThemeToggle";

const Index = () => {
  return (
    <div className="min-h-screen bg-groww-lightBg dark:bg-groww-darkBg py-8 px-4 sm:px-6 transition-colors duration-200">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-end mb-4">
          <ThemeToggle />
        </div>
        <OptionCalculator />
      </div>
    </div>
  );
};

export default Index;
