import React from "react";

export const Card = ({ children, className = "" }: React.PropsWithChildren<{ className?: string }>) => {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow p-4 w-full ${className}`}>
      {children}
    </div>
  );
};
