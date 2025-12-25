import metricsData from "../config/metrics.json";

interface FdvTier {
  min?: number;
  max?: number;
  label: string;
}

interface ExchangeTier {
  exchanges: string[];
  avgSpreads: { min: number; max?: number };
  label: string;
}

interface ScoringRange {
  max?: number;
  score: number;
  autoDowngrade?: number;
}

interface ScoringRule {
  score?: number;
  description?: string;
  condition?: string;
  autoDowngrade?: number;
  tier?: string;
  ranges?: ScoringRange[];
  finding?: {
    severity: "Critical" | "High" | "Medium" | "Low";
    title: string;
    description: string;
    recommendation: string;
  };
}

interface Component {
  id: string;
  name: string;
  weight?: number;
  scoring: ScoringRule[];
}

interface Metric {
  id: string;
  name: string;
  weight?: number;
  fdvDependent?: boolean;
  exchangeDependent?: boolean;
  components?: Component[];
  scoring?: ScoringRule[];
}

interface RatingBand {
  min: number;
  grade: string;
  description: string;
}

interface AutoDowngrade {
  condition: string;
  adjustment: number;
  finding?: {
    severity: "Critical" | "High" | "Medium" | "Low";
    title: string;
    description: string;
    recommendation: string;
  };
}

interface MetricsData {
  version: string;
  fdvTiers: Record<string, FdvTier>;
  exchangeTiers: Record<string, ExchangeTier>;
  metrics: Metric[];
  ratingScale: RatingBand[];
  autoDowngrades?: AutoDowngrade[];
  findings?: {
    allocation: {
      optimalRanges: Record<string, number>;
    };
  };
  redFlags?: {
    critical?: { condition: string; description: string }[];
    major?: { condition: string; description: string }[];
  };
}

const metrics = metricsData as MetricsData;

interface Finding {
  severity: "Critical" | "High" | "Medium" | "Low";
  category: string;
  title: string;
  description: string;
  recommendation: string;
  metric: string;
  component?: string;
}

interface TierInfo {
  fdvTier: string;
  fdvTierLabel: string;
  exchangeTier: string;
  exchangeTierLabel: string;
  fdvValue?: number;
  exchangeName?: string;
}

interface ComponentScore {
  score: number;
  maxPossible: number;
  flags: string[];
  findings?: Finding[];
}

interface MetricScore {
  score: number;
  maxPossible: number;
  achieved: number;
  components?: Record<string, ComponentScore>;
  findings?: Finding[];
}

export interface ScoringResult {
  totalScore: number;
  grade: string;
  gradeDescription: string;
  metrics: Record<string, MetricScore>;
  flags: string[];
  recommendations: string[];
  tierInfo: TierInfo;
  findings: Finding[];
}

export class ScoringEngine {
  private evaluateCondition(condition: string, facts: any): boolean {
    try {
      return new Function("facts", `return ${condition}`)(facts);
    } catch (error) {
      console.error(`Condition evaluation failed for "${condition}":`, error);
      return false;
    }
  }

  private snapToDisplayScore(score: number, max: number): number {
    const roundedScore = Math.round(score);

    // If it's a percentage (0-100)
    if (max === 100) {
      if (roundedScore <= 12) return 13;
      if (roundedScore >= 85) return 85;
      return roundedScore;
    }

    if (max === 25) {
      if (roundedScore <= 5) return 6;
      if (roundedScore >= 17) return 17;
      return roundedScore;
    }

    if (max === 20) {
      if (roundedScore <= 4) return 5;
      if (roundedScore >= 16) return 16;
      return roundedScore;
    }

    if (max === 15) {
      if (roundedScore <= 3) return 4;
      if (roundedScore >= 10) return 10;
      return roundedScore;
    }

    if (max === 10) {
      if (roundedScore <= 2) return 3;
      if (roundedScore >= 7) return 7;
      return roundedScore;
    }

    if (max === 5) {
      if (roundedScore <= 2) return 2;
      return 3;
    }

    // Fallback for other max values (proportional)
    if (roundedScore <= 0) return Math.max(1, Math.round(max * 0.15));
    if (roundedScore >= max) return Math.max(1, Math.floor(max * 0.88));
    return roundedScore;
  }

  public redactResult(result: ScoringResult): any {
    const redacted = JSON.parse(JSON.stringify(result));
    const REDACTION_MESSAGE = "Upgrade to Pro to unlock detailed findings and strategic advice.";

    // Redact main recommendations
    if (redacted.recommendations) {
      redacted.recommendations = redacted.recommendations.map(() => REDACTION_MESSAGE);
    }

    // Redact main findings
    if (redacted.findings) {
      redacted.findings = redacted.findings.map((f: any) => ({
        ...f,
        description: REDACTION_MESSAGE,
        recommendation: REDACTION_MESSAGE,
      }));
    }

    // Redact flags
    if (redacted.flags) {
      redacted.flags = redacted.flags.map(() => "Potential risk identified (Upgrade to reveal)");
    }

    // Redact metric-level findings
    if (redacted.metrics) {
      for (const metricId in redacted.metrics) {
        const metric = redacted.metrics[metricId];
        if (metric.findings) {
          metric.findings = metric.findings.map((f: any) => ({
            ...f,
            description: REDACTION_MESSAGE,
            recommendation: REDACTION_MESSAGE,
          }));
        }
      }
    }

    return redacted;
  }

  private getTier(fdv: number | null | undefined): {
    tier: string;
    label: string;
  } {
    if (fdv === null || fdv === undefined) {
      return {
        tier: "MicroCap",
        label: metrics.fdvTiers["MicroCap"]?.label || "Micro Cap",
      };
    }

    for (const [tier, config] of Object.entries(metrics.fdvTiers)) {
      const min = config.min ?? 0;
      const max = config.max ?? Number.POSITIVE_INFINITY;
      if (fdv >= min && fdv <= max) {
        return { tier, label: config.label };
      }
    }
    return {
      tier: "MicroCap",
      label: metrics.fdvTiers["MicroCap"]?.label || "Micro Cap",
    };
  }

  private getExchangeTier(exchange: string | null | undefined): {
    tier: string;
    label: string;
  } {
    if (!exchange) {
      return {
        tier: "Tier3",
        label: metrics.exchangeTiers["Tier3"]?.label || "Tier 3",
      };
    }

    for (const [tier, tierData] of Object.entries(metrics.exchangeTiers)) {
      if (tierData.exchanges.includes(exchange)) {
        return { tier, label: tierData.label };
      }
    }
    return {
      tier: "Tier3",
      label: metrics.exchangeTiers["Tier3"]?.label || "Tier 3",
    };
  }

  private createFinding(
    severity: Finding["severity"],
    category: string,
    title: string,
    description: string,
    recommendation: string,
    metric: string,
    component?: string
  ): Finding {
    const finding: Finding = {
      severity,
      category,
      title,
      description,
      recommendation,
      metric,
    };

    if (component !== undefined) {
      finding.component = component;
    }

    return finding;
  }

  public scoreAgreement(facts: any): ScoringResult {
    console.log("Input facts:", facts);

    const result: ScoringResult = {
      totalScore: 0,
      grade: "",
      gradeDescription: "",
      metrics: {},
      flags: [],
      recommendations: [],
      tierInfo: {
        fdvTier: "",
        fdvTierLabel: "",
        exchangeTier: "",
        exchangeTierLabel: "",
        fdvValue: facts.fdv,
        exchangeName: facts.exchange,
      },
      findings: [],
    };

    // Calculate tier information
    const fdvTierInfo = this.getTier(facts.fdv);
    const exchangeTierInfo = this.getExchangeTier(facts.exchange);

    result.tierInfo = {
      fdvTier: fdvTierInfo.tier,
      fdvTierLabel: fdvTierInfo.label,
      exchangeTier: exchangeTierInfo.tier,
      exchangeTierLabel: exchangeTierInfo.label,
      fdvValue: facts.fdv,
      exchangeName: facts.exchange,
    };

    // Generate findings based on facts (legacy manual check)
    this.generateFindings(facts, fdvTierInfo.tier, exchangeTierInfo.tier, result);

    // Process Red Flags from JSON config
    this.processRedFlags(facts, result);

    let totalAchieved = 0;
    let totalPossible = 0;

    const scoringFacts = { ...facts };
    for (const key in scoringFacts) {
      if (scoringFacts[key] === null) {
        scoringFacts[key] = null;
      }
    }

    for (const metric of metrics.metrics) {
      const metricWeight = metric.weight ?? 1;
      const metricResult: MetricScore = {
        score: 0,
        maxPossible: 0,
        achieved: 0,
        components: {},
        findings: [],
      };

      if (metric.components?.length) {
        let componentAchieved = 0;
        let componentPossible = 0;

        for (const component of metric.components) {
          const componentWeight = component.weight ?? 1;
          let componentScore = 0;
          let maxComponentScore = 0;
          const componentFlags: string[] = [];
          const componentFindings: Finding[] = [];

          const relevantTier = metric.fdvDependent
            ? fdvTierInfo.tier
            : metric.exchangeDependent
              ? exchangeTierInfo.tier
              : null;

          for (const rule of component.scoring) {
            if (rule.ranges && rule.tier) {
              if (relevantTier && rule.tier === relevantTier) {
                maxComponentScore = Math.max(
                  maxComponentScore,
                  ...rule.ranges.map((r) => r.score)
                );
              }
            } else if (rule.score && !rule.tier) {
              maxComponentScore = Math.max(maxComponentScore, rule.score);
            }
          }

          let ruleApplied = false;

          for (const rule of component.scoring) {
            if (rule.tier && rule.ranges) {
              if (rule.tier === relevantTier) {
                const value = scoringFacts[component.id];

                if (value === null) {
                  componentScore = 0;
                  componentFlags.push(`Missing data: ${component.name}`);
                  ruleApplied = true;
                  break;
                }

                for (const range of rule.ranges) {
                  if (value <= (range.max ?? Number.POSITIVE_INFINITY)) {
                    componentScore = range.score;
                    if (range.autoDowngrade) {
                      result.flags.push(
                        `Auto-downgrade applied for ${component.name}`
                      );
                    }
                    ruleApplied = true;
                    break;
                  }
                }
                if (ruleApplied) break;
              }
            } else if (rule.condition) {
              if (this.evaluateCondition(rule.condition, scoringFacts)) {
                componentScore = rule.score ?? 0;
                if (rule.autoDowngrade) {
                  result.flags.push(
                    `Auto-downgrade applied for ${component.name}`
                  );
                }
                if (rule.finding) {
                  componentFindings.push(
                    this.createFinding(
                      rule.finding.severity,
                      metric.name,
                      rule.finding.title,
                      rule.finding.description,
                      rule.finding.recommendation,
                      metric.id,
                      component.id
                    )
                  );
                }
                if (rule.description) {
                  componentFlags.push(rule.description);
                }
                ruleApplied = true;
                break;
              }
            }
          }

          if (!ruleApplied && scoringFacts[component.id] === null) {
            componentScore = 0;
            componentFlags.push(`Missing data: ${component.name}`);
          }

          componentAchieved += componentScore * componentWeight;
          componentPossible += maxComponentScore * componentWeight;

          metricResult.components![component.id] = {
            score: componentScore,
            maxPossible: maxComponentScore,
            flags: componentFlags,
            findings: componentFindings,
          };

          result.findings.push(...componentFindings);
        }

        metricResult.achieved = componentAchieved;
        metricResult.maxPossible = componentPossible;
        metricResult.score =
          componentPossible > 0
            ? (componentAchieved / componentPossible) * 100
            : 0;
      } else if (metric.scoring?.length) {
        let metricScore = 0;
        let maxMetricScore = 0;
        let ruleApplied = false;

        for (const rule of metric.scoring) {
          const ruleScore = rule.score ?? 0;
          maxMetricScore = Math.max(maxMetricScore, ruleScore);

          if (
            rule.condition &&
            this.evaluateCondition(rule.condition, scoringFacts)
          ) {
            metricScore = ruleScore;
            if (rule.autoDowngrade) {
              result.flags.push(`Auto-downgrade applied for ${metric.name}`);
            }
            if (rule.finding) {
              const finding = this.createFinding(
                rule.finding.severity,
                metric.name,
                rule.finding.title,
                rule.finding.description,
                rule.finding.recommendation,
                metric.id
              );
              metricResult.findings!.push(finding);
              result.findings.push(finding);
            }
            if (rule.description) {
              result.recommendations.push(rule.description);
            }
            ruleApplied = true;
            break;
          }
        }

        if (
          !ruleApplied &&
          Object.keys(scoringFacts).some(
            (key) => scoringFacts[key] === null && metric.id.includes(key)
          )
        ) {
          metricScore = 0;
          result.flags.push(`Missing data for metric: ${metric.name}`);
        }

        metricResult.achieved = metricScore * metricWeight;
        metricResult.maxPossible = maxMetricScore * metricWeight;
        metricResult.score =
          maxMetricScore > 0 ? (metricScore / maxMetricScore) * 100 : 0;
      }

      totalAchieved += metricResult.achieved;
      totalPossible += metricResult.maxPossible;
      result.metrics[metric.id] = metricResult;
    }

    result.totalScore =
      totalPossible > 0 ? (totalAchieved / totalPossible) * 100 : 0;

    if (metrics.autoDowngrades) {
      for (const downgrade of metrics.autoDowngrades) {
        if (this.evaluateCondition(downgrade.condition, scoringFacts)) {
          result.totalScore = Math.max(
            0,
            result.totalScore + downgrade.adjustment
          );
          result.flags.push(`Auto-downgrade applied: ${downgrade.condition}`);

          if (downgrade.finding) {
            result.findings.push(
              this.createFinding(
                downgrade.finding.severity,
                "Auto Downgrade",
                downgrade.finding.title,
                downgrade.finding.description,
                downgrade.finding.recommendation,
                "system"
              )
            );
          }
        }
      }
    }

    // --- SCORE SNAPPING (FUZZING) ---
    // Apply snapping to individual metrics first
    for (const metricId in result.metrics) {
      const metric = result.metrics[metricId];
      if (metric) {
        // Snap the achieved value
        metric.achieved = this.snapToDisplayScore(metric.achieved, metric.maxPossible);
        // Recalculate the percentage score based on snapped achieved value
        metric.score = metric.maxPossible > 0 ? (metric.achieved / metric.maxPossible) * 100 : 0;
      }
    }

    // Snap the total score (max 100)
    result.totalScore = this.snapToDisplayScore(result.totalScore, 100);

    for (const grade of metrics.ratingScale) {
      if (result.totalScore >= grade.min) {
        result.grade = grade.grade;
        result.gradeDescription = grade.description;
        break;
      }
    }

    // Aggregate unique recommendations from all findings
    const collectedRecommendations = result.findings
      .map(f => f.recommendation)
      .filter(r => r && r.trim().length > 0);

    // Merge with any existing recommendations and ensure uniqueness
    result.recommendations = Array.from(new Set([...result.recommendations, ...collectedRecommendations]));

    console.log("Scoring result (post-snapping):", result);
    return result;
  }

  private processRedFlags(facts: any, result: ScoringResult): void {
    if (!metrics.redFlags) return;

    // Process Critical Red Flags
    if (metrics.redFlags.critical) {
      for (const flag of metrics.redFlags.critical) {
        if (this.evaluateCondition(flag.condition, facts)) {
          result.findings.push(
            this.createFinding(
              "Critical",
              "Critical Red Flag",
              "Critical Issue Detected",
              flag.description,
              "Immediate attention required. This term is highly non-standard.",
              "redFlag",
              "critical"
            )
          );
          // Also add to flags list for legacy support
          result.flags.push(flag.description);
        }
      }
    }

    // Process Major Red Flags
    if (metrics.redFlags.major) {
      for (const flag of metrics.redFlags.major) {
        if (this.evaluateCondition(flag.condition, facts)) {
          result.findings.push(
            this.createFinding(
              "High",
              "Major Red Flag",
              "Major Issue Detected",
              flag.description,
              "Strongly recommended to negotiate this term.",
              "redFlag",
              "major"
            )
          );
          // Also add to flags list for legacy support
          result.flags.push(flag.description);
        }
      }
    }
  }

  private generateFindings(
    facts: any,
    fdvTier: string,
    exchangeTier: string,
    result: ScoringResult
  ): void {
    // Termination rights findings
    if (
      facts.windDownDefined !== undefined &&
      facts.noticePeriodDays !== undefined
    ) {
      const noticePeriod = facts.noticePeriodDays;

      if (noticePeriod >= 30 && noticePeriod <= 60) {
        result.findings.push(
          this.createFinding(
            "Low",
            "Termination Rights",
            "Market termination rights",
            "30–60 days notice with clear 7–30 day wind-down procedures.",
            "Ensure wind-down procedures are well defined and practical.",
            "agreementStructure",
            "termination"
          )
        );
      } else if (noticePeriod > 60 && noticePeriod <= 90) {
        result.findings.push(
          this.createFinding(
            "Low",
            "Termination Rights",
            "Market termination rights",
            "60–90 days notice with defined wind-down.",
            "Maintain defined wind-down procedures for smooth transition.",
            "agreementStructure",
            "termination"
          )
        );
      } else if (noticePeriod > 90 && noticePeriod <= 120) {
        result.findings.push(
          this.createFinding(
            "Medium",
            "Termination Rights",
            "Market termination rights",
            "90–120 days notice with only basic wind-down.",
            "Enhance wind-down details for clarity and fairness.",
            "agreementStructure",
            "termination"
          )
        );
      } else if (noticePeriod > 120 && noticePeriod <= 180) {
        result.findings.push(
          this.createFinding(
            "Medium",
            "Termination Rights",
            "Market termination rights",
            ">120 days notice but some procedures exist.",
            "Consider shortening notice period while keeping procedures.",
            "agreementStructure",
            "termination"
          )
        );
      } else if (noticePeriod > 180) {
        result.findings.push(
          this.createFinding(
            "High",
            "Termination Rights",
            "Market termination rights",
            "Excessive notice periods (>180 days) or unclear procedures.",
            "Revise termination terms to balance notice and wind-down procedures.",
            "agreementStructure",
            "termination"
          )
        );
      }
    }

    // Clawback provisions findings
    if (facts.clawback !== undefined) {
      const clawback = facts.clawback;

      if (clawback === "strong") {
        result.findings.push(
          this.createFinding(
            "Low",
            "Vesting Terms",
            "Strong clawback provisions",
            "Strong clawback provisions tied to performance milestones with automatic triggers.",
            "Maintain robust clawback mechanisms to ensure accountability.",
            "tokenEconomics",
            "clawback"
          )
        );
      } else if (clawback === "moderate") {
        result.findings.push(
          this.createFinding(
            "Low",
            "Vesting Terms",
            "Moderate clawback provisions",
            "Moderate clawback provisions with clear triggers and enforcement mechanisms.",
            "Ensure enforcement remains consistent and transparent.",
            "tokenEconomics",
            "clawback"
          )
        );
      } else if (clawback === "basic") {
        result.findings.push(
          this.createFinding(
            "Medium",
            "Vesting Terms",
            "Basic clawback provisions",
            "Basic clawback provisions with some performance requirements.",
            "Enhance clawback provisions to include stronger performance-based triggers.",
            "tokenEconomics",
            "clawback"
          )
        );
      } else if (clawback === "weak") {
        result.findings.push(
          this.createFinding(
            "Medium",
            "Vesting Terms",
            "Weak clawback provisions",
            "Weak clawback mechanisms with limited enforcement.",
            "Strengthen enforcement mechanisms and link clawback to performance milestones.",
            "tokenEconomics",
            "clawback"
          )
        );
      }
    }
  }
}
