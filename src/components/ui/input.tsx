import React from "react";

export const Input = ({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) => {
  return (
    <input
      className={`w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
      {...props}
    />
  );
};
