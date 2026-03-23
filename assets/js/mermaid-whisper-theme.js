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
      primary:              '#2F5EE9',
      onPrimary:            '#FFFFFF',
      primaryContainer:     '#DAE2FF',
      onPrimaryContainer:   '#001A5C',
      secondary:            '#555F71',
      onSecondary:          '#FFFFFF',
      secondaryContainer:   '#D9E3F8',
      onSecondaryContainer: '#121C2B',
      tertiary:             '#6E5676',
      onTertiary:           '#FFFFFF',
      tertiaryContainer:    '#F8D8FF',
      onTertiaryContainer:  '#271430',
      error:                '#D32F2F',
      onError:              '#FFFFFF',
      errorContainer:       '#FDECEA',
      onErrorContainer:     '#410E0B',
      surface:              '#FFFFFF',
      onSurface:            '#111111',
      surfaceVariant:       '#E0E0E0',
      onSurfaceVariant:     '#878787',
      outline:              '#CCCCCC',
      outlineVariant:       '#E0E0E0',
      surfaceContainer:     '#F6F6F6',
      surfaceContainerHigh: '#EEEEEE',
      surfaceContainerHighest: '#E5E5E5'
    },
    dark: {
      primary:              '#7B9EF5',
      onPrimary:            '#111111',
      primaryContainer:     '#1A3A7A',
      onPrimaryContainer:   '#DAE2FF',
      secondary:            '#BDC7DC',
      onSecondary:          '#273141',
      secondaryContainer:   '#3D4758',
      onSecondaryContainer: '#D9E3F8',
      tertiary:             '#DBBCE3',
      onTertiary:           '#3D2846',
      tertiaryContainer:    '#553F5D',
      onTertiaryContainer:  '#F8D8FF',
      error:                '#EF9A9A',
      onError:              '#111111',
      errorContainer:       '#3D1A1A',
      onErrorContainer:     '#EF9A9A',
      surface:              '#111111',
      onSurface:            '#E5E5E5',
      surfaceVariant:       '#333333',
      onSurfaceVariant:     '#878787',
      outline:              '#444444',
      outlineVariant:       '#333333',
      surfaceContainer:     '#1A1A1A',
      surfaceContainerHigh: '#222222',
      surfaceContainerHighest: '#2A2A2A'
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

    fontFamily: "'DM Mono', 'Menlo', 'Consolas', monospace",
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

    fontFamily: "'DM Mono', 'Menlo', 'Consolas', monospace",
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
