/**
 * A saved chart layout: which indicators sit on which pane, plus the
 * horizontal reference lines drawn on them.
 */
export interface ConstantLine {
  value: number;
  color: string;
  label: string;
}

export interface ViewSetting {
  id: string;
  name: string;
  enabledIndicators1: string[];
  enabledIndicators2: string[];
  constantLines1: ConstantLine[];
  constantLines2: ConstantLine[];
  period?: string; // daily, weekly, monthly, quarterly
  createdAt: string;
  updatedAt?: string;
}
