import { describe, expect, it } from 'vitest'
import {
  describeClientNavFeaturesMode,
  getSetupPackageNavFeatures,
  isLegacyUnlimitedNavFeatures,
  isNavFeatureEnabled,
  isSetupPackageNavFeatures,
  PREMIUM_NAV_FEATURE_IDS,
  REQUIRED_NAV_FEATURE_IDS,
  SETUP_PACKAGE_NAV_FEATURE_IDS,
} from '@/lib/client-nav-features'
import { DEFAULT_SIDEBAR_NAV_ORDER, resolveSidebarNavItems } from '@/lib/sidebar-nav'

describe('client nav features', () => {
  it('null enabled list allows all features (legacy tenants)', () => {
    expect(isLegacyUnlimitedNavFeatures(null)).toBe(true)
    expect(isNavFeatureEnabled(null, 'calendar')).toBe(true)
    expect(describeClientNavFeaturesMode(null)).toBe('legacy_unlimited')
  })

  it('setup package excludes all premium addons', () => {
    expect(PREMIUM_NAV_FEATURE_IDS).toEqual([
      'calendar',
      'attendance',
      'professionals',
      'pilot_sms',
      'project_documents',
      'whatsapp_inbox',
      'campaigns',
      'collections',
    ])
    for (const premium of PREMIUM_NAV_FEATURE_IDS) {
      expect(SETUP_PACKAGE_NAV_FEATURE_IDS).not.toContain(premium)
    }
    for (const required of REQUIRED_NAV_FEATURE_IDS) {
      expect(SETUP_PACKAGE_NAV_FEATURE_IDS).toContain(required)
    }
    expect(isSetupPackageNavFeatures(getSetupPackageNavFeatures())).toBe(true)
    expect(describeClientNavFeaturesMode(getSetupPackageNavFeatures())).toBe('setup_package')
  })

  it('filters sidebar items when enabled list is set', () => {
    const items = resolveSidebarNavItems(null, ['dashboard', 'tickets', 'projects'])
    expect(items.map((i) => i.id)).toEqual(['dashboard', 'tickets', 'projects'])
  })

  it('blocks calendar when not in enabled list', () => {
    expect(isNavFeatureEnabled(['dashboard', 'tickets'], 'calendar')).toBe(false)
  })

  it('setup package keeps free tools even when they are not top-level sidebar items', () => {
    expect(SETUP_PACKAGE_NAV_FEATURE_IDS).toEqual([
      'dashboard',
      'tickets',
      'projects',
      'residents',
      'workers',
      'summary',
      'qr',
      'whatsapp_templates',
      'pending_residents',
    ])
    // Sidebar default is curated separately and may omit QR/templates/pending.
    expect(DEFAULT_SIDEBAR_NAV_ORDER).not.toContain('qr')
  })
})
