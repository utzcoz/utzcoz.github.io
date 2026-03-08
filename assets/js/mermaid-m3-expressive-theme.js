/**
 * Material 3 Expressive Theme for Mermaid
 *
 * A modular, reusable Mermaid theme based on Material 3 Expressive design tokens.
 * Seed color: #6750A4 (M3 purple)
 *
 * Usage:
 *
 *   // As ES module:
 *   import { light, dark, getTheme } from './mermaid-m3-expressive-theme.js';
 *   mermaid.initialize({ theme: 'base', themeVariables: light });
 *
 *   // As global script:
 *   <script src="mermaid-m3-expressive-theme.js"></script>
 *   mermaid.initialize({ theme: 'base', themeVariables: mermaidM3Expressive.light });
 *
 *   // Auto-detect light/dark:
 *   mermaid.initialize({ theme: 'base', themeVariables: mermaidM3Expressive.getTheme(isDark) });
 */
(function (root, factory) {
  var theme = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = theme;
  } else if (typeof define === 'function' && define.amd) {
    define(function () { return theme; });
  } else {
    root.mermaidM3Expressive = theme;
  }
}(typeof self !== 'undefined' ? self : this, function () {

  // ---------------------------------------------------------------------------
  // M3 Expressive Color Tokens — Seed: #6750A4
  // ---------------------------------------------------------------------------
  var tokens = {
    light: {
      primary:              '#6750A4',
      onPrimary:            '#FFFFFF',
      primaryContainer:     '#EADDFF',
      onPrimaryContainer:   '#21005D',
      secondary:            '#625B71',
      onSecondary:          '#FFFFFF',
      secondaryContainer:   '#E8DEF8',
      onSecondaryContainer: '#1D192B',
      tertiary:             '#7D5260',
      onTertiary:           '#FFFFFF',
      tertiaryContainer:    '#FFD8E4',
      onTertiaryContainer:  '#31111D',
      error:                '#B3261E',
      onError:              '#FFFFFF',
      errorContainer:       '#F9DEDC',
      onErrorContainer:     '#410E0B',
      surface:              '#FEF7FF',
      onSurface:            '#1C1B1F',
      surfaceVariant:       '#E7E0EC',
      onSurfaceVariant:     '#49454F',
      outline:              '#79747E',
      outlineVariant:       '#CAC4D0',
      surfaceContainer:     '#F3EDF7',
      surfaceContainerHigh: '#ECE6F0',
      surfaceContainerHighest: '#E6E0E9',
      inverseSurface:       '#313033',
      inverseOnSurface:     '#F4EFF4'
    },
    dark: {
      primary:              '#D0BCFF',
      onPrimary:            '#381E72',
      primaryContainer:     '#4F378B',
      onPrimaryContainer:   '#EADDFF',
      secondary:            '#CCC2DC',
      onSecondary:          '#332D41',
      secondaryContainer:   '#4A4458',
      onSecondaryContainer: '#E8DEF8',
      tertiary:             '#EFB8C8',
      onTertiary:           '#492532',
      tertiaryContainer:    '#633B48',
      onTertiaryContainer:  '#FFD8E4',
      error:                '#F2B8B5',
      onError:              '#601410',
      errorContainer:       '#8C1D18',
      onErrorContainer:     '#F9DEDC',
      surface:              '#141218',
      onSurface:            '#E6E0E9',
      surfaceVariant:       '#49454F',
      onSurfaceVariant:     '#CAC4D0',
      outline:              '#938F99',
      outlineVariant:       '#49454F',
      surfaceContainer:     '#211F26',
      surfaceContainerHigh: '#2B2930',
      surfaceContainerHighest: '#36343B',
      inverseSurface:       '#E6E0E9',
      inverseOnSurface:     '#313033'
    }
  };

  // ---------------------------------------------------------------------------
  // Mermaid themeVariables — Light
  // ---------------------------------------------------------------------------
  var light = {
    // Diagram background
    background: tokens.light.surface,

    // Primary colors
    primaryColor: tokens.light.primaryContainer,
    primaryTextColor: tokens.light.onPrimaryContainer,
    primaryBorderColor: tokens.light.primary,

    // Secondary colors
    secondaryColor: tokens.light.secondaryContainer,
    secondaryTextColor: tokens.light.onSecondaryContainer,
    secondaryBorderColor: tokens.light.secondary,

    // Tertiary colors
    tertiaryColor: tokens.light.tertiaryContainer,
    tertiaryTextColor: tokens.light.onTertiaryContainer,
    tertiaryBorderColor: tokens.light.tertiary,

    // Notes
    noteBkgColor: tokens.light.surfaceContainerHigh,
    noteTextColor: tokens.light.onSurface,
    noteBorderColor: tokens.light.outlineVariant,

    // Text and lines
    lineColor: tokens.light.outline,
    textColor: tokens.light.onSurface,
    mainBkg: tokens.light.primaryContainer,

    // Flowchart
    nodeBorder: tokens.light.primary,
    clusterBkg: tokens.light.surfaceContainer,
    clusterBorder: tokens.light.outlineVariant,
    defaultLinkColor: tokens.light.onSurfaceVariant,
    titleColor: tokens.light.onSurface,
    edgeLabelBackground: tokens.light.surfaceContainer,

    // Sequence diagram
    actorBkg: tokens.light.primaryContainer,
    actorTextColor: tokens.light.onPrimaryContainer,
    actorBorder: tokens.light.primary,
    actorLineColor: tokens.light.outline,
    signalColor: tokens.light.onSurface,
    signalTextColor: tokens.light.onSurface,
    labelBoxBkgColor: tokens.light.surfaceContainer,
    labelBoxBorderColor: tokens.light.outlineVariant,
    labelTextColor: tokens.light.onSurface,
    loopTextColor: tokens.light.onSurfaceVariant,
    activationBorderColor: tokens.light.primary,
    activationBkgColor: tokens.light.primaryContainer,
    sequenceNumberColor: tokens.light.onPrimary,

    // State diagram
    labelColor: tokens.light.onSurface,
    altBackground: tokens.light.surfaceContainer,

    // Class diagram
    classText: tokens.light.onPrimaryContainer,

    // Git graph
    git0: tokens.light.primaryContainer,
    git1: tokens.light.secondaryContainer,
    git2: tokens.light.tertiaryContainer,
    git3: tokens.light.surfaceContainerHighest,
    git4: '#D3E4FF',
    git5: '#FFF3E0',
    git6: '#E8F5E9',
    git7: '#FFF8E1',
    gitBranchLabel0: tokens.light.onPrimaryContainer,
    gitBranchLabel1: tokens.light.onSecondaryContainer,
    gitBranchLabel2: tokens.light.onTertiaryContainer,
    gitBranchLabel3: tokens.light.onSurface,
    gitInv0: tokens.light.primary,

    // Pie chart
    pie1: tokens.light.primary,
    pie2: tokens.light.secondary,
    pie3: tokens.light.tertiary,
    pie4: '#7D8CC4',
    pie5: '#A0C4A9',
    pie6: '#D4A574',
    pie7: '#C49BBB',
    pieStrokeColor: tokens.light.surface,
    pieTitleTextSize: '18px',
    pieTitleTextColor: tokens.light.onSurface,
    pieSectionTextColor: tokens.light.onPrimary,
    pieSectionTextSize: '14px',
    pieOuterStrokeColor: tokens.light.outlineVariant,

    // Error
    errorBkgColor: tokens.light.errorContainer,
    errorTextColor: tokens.light.onErrorContainer,

    // Fonts
    fontFamily: "'Outfit', sans-serif",
    fontSize: '14px'
  };

  // ---------------------------------------------------------------------------
  // Mermaid themeVariables — Dark
  // ---------------------------------------------------------------------------
  var dark = {
    // Diagram background
    background: tokens.dark.surface,

    // Primary colors
    primaryColor: tokens.dark.primaryContainer,
    primaryTextColor: tokens.dark.onPrimaryContainer,
    primaryBorderColor: tokens.dark.primary,

    // Secondary colors
    secondaryColor: tokens.dark.secondaryContainer,
    secondaryTextColor: tokens.dark.onSecondaryContainer,
    secondaryBorderColor: tokens.dark.secondary,

    // Tertiary colors
    tertiaryColor: tokens.dark.tertiaryContainer,
    tertiaryTextColor: tokens.dark.onTertiaryContainer,
    tertiaryBorderColor: tokens.dark.tertiary,

    // Notes
    noteBkgColor: tokens.dark.surfaceContainerHigh,
    noteTextColor: tokens.dark.onSurface,
    noteBorderColor: tokens.dark.outlineVariant,

    // Text and lines
    lineColor: tokens.dark.outline,
    textColor: tokens.dark.onSurface,
    mainBkg: tokens.dark.primaryContainer,

    // Flowchart
    nodeBorder: tokens.dark.primary,
    clusterBkg: tokens.dark.surfaceContainer,
    clusterBorder: tokens.dark.outlineVariant,
    defaultLinkColor: tokens.dark.onSurfaceVariant,
    titleColor: tokens.dark.onSurface,
    edgeLabelBackground: tokens.dark.surfaceContainer,

    // Sequence diagram
    actorBkg: tokens.dark.primaryContainer,
    actorTextColor: tokens.dark.onPrimaryContainer,
    actorBorder: tokens.dark.primary,
    actorLineColor: tokens.dark.outline,
    signalColor: tokens.dark.onSurface,
    signalTextColor: tokens.dark.onSurface,
    labelBoxBkgColor: tokens.dark.surfaceContainer,
    labelBoxBorderColor: tokens.dark.outlineVariant,
    labelTextColor: tokens.dark.onSurface,
    loopTextColor: tokens.dark.onSurfaceVariant,
    activationBorderColor: tokens.dark.primary,
    activationBkgColor: tokens.dark.primaryContainer,
    sequenceNumberColor: tokens.dark.onPrimary,

    // State diagram
    labelColor: tokens.dark.onSurface,
    altBackground: tokens.dark.surfaceContainer,

    // Class diagram
    classText: tokens.dark.onPrimaryContainer,

    // Git graph
    git0: tokens.dark.primaryContainer,
    git1: tokens.dark.secondaryContainer,
    git2: tokens.dark.tertiaryContainer,
    git3: tokens.dark.surfaceContainerHighest,
    git4: '#334863',
    git5: '#4E3B24',
    git6: '#1B3A1B',
    git7: '#4E4424',
    gitBranchLabel0: tokens.dark.onPrimaryContainer,
    gitBranchLabel1: tokens.dark.onSecondaryContainer,
    gitBranchLabel2: tokens.dark.onTertiaryContainer,
    gitBranchLabel3: tokens.dark.onSurface,
    gitInv0: tokens.dark.primary,

    // Pie chart
    pie1: tokens.dark.primary,
    pie2: tokens.dark.secondary,
    pie3: tokens.dark.tertiary,
    pie4: '#9EACD7',
    pie5: '#A8CCAD',
    pie6: '#D4B896',
    pie7: '#D1A8C8',
    pieStrokeColor: tokens.dark.surface,
    pieTitleTextSize: '18px',
    pieTitleTextColor: tokens.dark.onSurface,
    pieSectionTextColor: tokens.dark.onPrimary,
    pieSectionTextSize: '14px',
    pieOuterStrokeColor: tokens.dark.outlineVariant,

    // Error
    errorBkgColor: tokens.dark.errorContainer,
    errorTextColor: tokens.dark.onErrorContainer,

    // Fonts
    fontFamily: "'Outfit', sans-serif",
    fontSize: '14px'
  };

  // ---------------------------------------------------------------------------
  // Helper: get theme by mode
  // ---------------------------------------------------------------------------
  function getTheme(isDark) {
    return isDark ? dark : light;
  }

  return {
    tokens: tokens,
    light: light,
    dark: dark,
    getTheme: getTheme
  };

}));
