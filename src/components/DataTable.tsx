import React from 'react';

interface Column {
  key: string;
  header: string;
  render?: (row: any) => React.ReactNode;
}

interface DataTableProps {
  data: any[];
  columns: Column[];
}

export function DataTable({ data, columns }: DataTableProps) {
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-slate-800">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="text-left px-3 py-2 font-medium text-gray-700 dark:text-slate-200">
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-slate-900">
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-gray-500 dark:text-slate-400">
                  No data available
                </td>
              </tr>
            ) : (
              data.map((row, index) => (
                <tr key={row.id || index} className="border-t border-slate-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800">
                  {columns.map((column) => (
                    <td key={column.key} className="px-3 py-2 text-slate-700 dark:text-slate-300">
                      {column.render ? column.render(row) : row[column.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}