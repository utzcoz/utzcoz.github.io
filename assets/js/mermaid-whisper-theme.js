/**
 * Whisper Theme for Mermaid
 *
 * A minimalist monospace Mermaid theme with blue accent colors.
 *
 * Usage:
 *
 *   // As ES module:
 *   import { light, dark, getTheme } from './mermaid-whisper-theme.js';
 *   mermaid.initialize({ theme: 'base', themeVariables: light });
 *
 *   // As global script:
 *   <script src="mermaid-whisper-theme.js"></script>
 *   mermaid.initialize({ theme: 'base', themeVariables: mermaidWhisper.light });
 *
 *   // Auto-detect light/dark:
 *   mermaid.initialize({ theme: 'base', themeVariables: mermaidWhisper.getTheme(isDark) });
 */
(function (root, factory) {
  var theme = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = theme;
  } else if (typeof define === 'function' && define.amd) {
    define(function () { return theme; });
  } else {
    root.mermaidWhisper = theme;
  }
}(typeof self !== 'undefined' ? self : this, function () {

  // ---------------------------------------------------------------------------
  // Color Tokens
  // ---------------------------------------------------------------------------
  var tokens = {
    light: {
      primary:              '#2557B8',
      onPrimary:            '#FFFFFF',
      primaryContainer:     '#E5EEFF',
      onPrimaryContainer:   '#10244D',
      secondary:            '#59636E',
      onSecondary:          '#FFFFFF',
      secondaryContainer:   '#E4EBF5',
      onSecondaryContainer: '#1F2328',
      tertiary:             '#6639BA',
      onTertiary:           '#FFFFFF',
      tertiaryContainer:    '#F1E8FF',
      onTertiaryContainer:  '#2D1454',
      error:                '#CF222E',
      onError:              '#FFFFFF',
      errorContainer:       '#FFEBE9',
      onErrorContainer:     '#4D0F14',
      surface:              '#FFFFFF',
      onSurface:            '#1F2328',
      surfaceVariant:       '#E5E7EB',
      onSurfaceVariant:     '#59636E',
      outline:              '#B6BEC7',
      outlineVariant:       '#E5E7EB',
      surfaceContainer:     '#F6F8FA',
      surfaceContainerHigh: '#EEF1F4',
      surfaceContainerHighest: '#E5E8EC'
    },
    dark: {
      primary:              '#7AA2F7',
      onPrimary:            '#101418',
      primaryContainer:     '#1B2D4F',
      onPrimaryContainer:   '#DCE6FF',
      secondary:            '#A8B3C2',
      onSecondary:          '#171C22',
      secondaryContainer:   '#252E3A',
      onSecondaryContainer: '#E6EDF3',
      tertiary:             '#B392F0',
      onTertiary:           '#1F1633',
      tertiaryContainer:    '#33254D',
      onTertiaryContainer:  '#EDE2FF',
      error:                '#F87171',
      onError:              '#101418',
      errorContainer:       '#3B1C20',
      onErrorContainer:     '#FCA5A5',
      surface:              '#101418',
      onSurface:            '#E6EDF3',
      surfaceVariant:       '#252B33',
      onSurfaceVariant:     '#8B949E',
      outline:              '#48525E',
      outlineVariant:       '#252B33',
      surfaceContainer:     '#171C22',
      surfaceContainerHigh: '#1D232B',
      surfaceContainerHighest: '#262E38'
    }
  };

  // ---------------------------------------------------------------------------
  // Mermaid themeVariables — Light
  // ---------------------------------------------------------------------------
  var light = {
    background: tokens.light.surface,

    primaryColor: tokens.light.primaryContainer,
    primaryTextColor: tokens.light.onPrimaryContainer,
    primaryBorderColor: tokens.light.primary,

    secondaryColor: tokens.light.secondaryContainer,
    secondaryTextColor: tokens.light.onSecondaryContainer,
    secondaryBorderColor: tokens.light.secondary,

    tertiaryColor: tokens.light.tertiaryContainer,
    tertiaryTextColor: tokens.light.onTertiaryContainer,
    tertiaryBorderColor: tokens.light.tertiary,

    noteBkgColor: tokens.light.surfaceContainerHigh,
    noteTextColor: tokens.light.onSurface,
    noteBorderColor: tokens.light.outlineVariant,

    lineColor: tokens.light.outline,
    textColor: tokens.light.onSurface,
    mainBkg: tokens.light.primaryContainer,

    nodeBorder: tokens.light.primary,
    clusterBkg: tokens.light.surfaceContainer,
    clusterBorder: tokens.light.outlineVariant,
    defaultLinkColor: tokens.light.onSurfaceVariant,
    titleColor: tokens.light.onSurface,
    edgeLabelBackground: tokens.light.surfaceContainer,

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

    labelColor: tokens.light.onSurface,
    altBackground: tokens.light.surfaceContainer,

    classText: tokens.light.onPrimaryContainer,

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

    pie1: tokens.light.primary,
    pie2: tokens.light.secondary,
    pie3: tokens.light.tertiary,
    pie4: '#7D8CC4',
    pie5: '#A0C4A9',
    pie6: '#D4A574',
    pie7: '#C49BBB',
    pieStrokeColor: tokens.light.surface,
    pieTitleTextSize: '15px',
    pieTitleTextColor: tokens.light.onSurface,
    pieSectionTextColor: tokens.light.onPrimary,
    pieSectionTextSize: '13px',
    pieOuterStrokeColor: tokens.light.outlineVariant,

    errorBkgColor: tokens.light.errorContainer,
    errorTextColor: tokens.light.onErrorContainer,

    fontFamily: "'IBM Plex Mono', 'SF Mono', 'Menlo', 'Consolas', monospace",
    fontSize: '13px'
  };

  // ---------------------------------------------------------------------------
  // Mermaid themeVariables — Dark
  // ---------------------------------------------------------------------------
  var dark = {
    background: tokens.dark.surface,

    primaryColor: tokens.dark.primaryContainer,
    primaryTextColor: tokens.dark.onPrimaryContainer,
    primaryBorderColor: tokens.dark.primary,

    secondaryColor: tokens.dark.secondaryContainer,
    secondaryTextColor: tokens.dark.onSecondaryContainer,
    secondaryBorderColor: tokens.dark.secondary,

    tertiaryColor: tokens.dark.tertiaryContainer,
    tertiaryTextColor: tokens.dark.onTertiaryContainer,
    tertiaryBorderColor: tokens.dark.tertiary,

    noteBkgColor: tokens.dark.surfaceContainerHigh,
    noteTextColor: tokens.dark.onSurface,
    noteBorderColor: tokens.dark.outlineVariant,

    lineColor: tokens.dark.outline,
    textColor: tokens.dark.onSurface,
    mainBkg: tokens.dark.primaryContainer,

    nodeBorder: tokens.dark.primary,
    clusterBkg: tokens.dark.surfaceContainer,
    clusterBorder: tokens.dark.outlineVariant,
    defaultLinkColor: tokens.dark.onSurfaceVariant,
    titleColor: tokens.dark.onSurface,
    edgeLabelBackground: tokens.dark.surfaceContainer,

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

    labelColor: tokens.dark.onSurface,
    altBackground: tokens.dark.surfaceContainer,

    classText: tokens.dark.onPrimaryContainer,

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

    pie1: tokens.dark.primary,
    pie2: tokens.dark.secondary,
    pie3: tokens.dark.tertiary,
    pie4: '#9EACD7',
    pie5: '#A8CCAD',
    pie6: '#D4B896',
    pie7: '#D1A8C8',
    pieStrokeColor: tokens.dark.surface,
    pieTitleTextSize: '15px',
    pieTitleTextColor: tokens.dark.onSurface,
    pieSectionTextColor: tokens.dark.onPrimary,
    pieSectionTextSize: '13px',
    pieOuterStrokeColor: tokens.dark.outlineVariant,

    errorBkgColor: tokens.dark.errorContainer,
    errorTextColor: tokens.dark.onErrorContainer,

    fontFamily: "'IBM Plex Mono', 'SF Mono', 'Menlo', 'Consolas', monospace",
    fontSize: '13px'
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
