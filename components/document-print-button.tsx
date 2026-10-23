"use client";

import { Printer } from "lucide-react";

export function DocumentPrintButton() {
  return <button type="button" className="button button-primary" onClick={() => window.print()}><Printer size={16}/> Print / save PDF</button>;
}
