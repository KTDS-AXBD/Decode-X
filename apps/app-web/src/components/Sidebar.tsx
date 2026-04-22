import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Upload,
  FileSearch,
  BarChart3,
  CheckSquare,
  Network,
  Package,
  Plug,
  FileText,
  BookOpen,
  Settings,
  User,
  Moon,
  Sun,
  Building2,
  LogOut,
  Code,
  GitCompareArrows,
  FileJson,
  PackageOpen,
  ChevronDown,
  Microscope,
  BadgeCheck,
  Rocket,
  Wrench,
  ScanSearch,
  Sparkles,
  MonitorPlay,
  LogIn,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTheme } from '@/contexts/ThemeContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';

interface MenuItem {
  icon: React.ReactNode;
  label: string;
  labelEn: string;
  path: string;
}

interface MenuGroup {
  id: string;
  icon: React.ReactNode;
  label: string;
  labelEn: string;
  items: MenuItem[];
  defaultOpen?: boolean;
}

const ORGANIZATIONS = [
  { id: 'Miraeasset', label: '미래에셋 퇴직연금', labelEn: 'Miraeasset Pension' },
  { id: 'org-mirae-pension', label: '미래에셋 (분석)', labelEn: 'Miraeasset (Analyzed)' },
  { id: 'LPON', label: 'LPON 온누리상품권', labelEn: 'LPON Gift Certificate' },
  { id: 'org-001', label: '파일럿', labelEn: 'Pilot' },
] as const;

// F375/F376/F378: S220 Executive View 메뉴 구조로 재편 (F377 Archive + 재배치 반영)
const menuGroups: MenuGroup[] = [
  {
    id: 'executive',
    icon: <Sparkles className="w-4 h-4" />,
    label: 'Executive',
    labelEn: 'Executive',
    defaultOpen: true,
    items: [
      { icon: <LayoutDashboard className="w-4 h-4" />, label: '현황 Overview', labelEn: 'Overview', path: '/executive/overview' },
      { icon: <BarChart3 className="w-4 h-4" />, label: '근거 자료', labelEn: 'Evidence', path: '/executive/evidence' },
      { icon: <PackageOpen className="w-4 h-4" />, label: 'Export 센터', labelEn: 'Export Center', path: '/export' },
    ],
  },
  {
    id: 'extract',
    icon: <Microscope className="w-4 h-4" />,
    label: '지식 추출',
    labelEn: 'Extract',
    defaultOpen: false,
    items: [
      { icon: <Upload className="w-4 h-4" />, label: '문서 업로드', labelEn: 'Document Upload', path: '/upload' },
      { icon: <Code className="w-4 h-4" />, label: '소스코드 업로드', labelEn: 'Source Upload', path: '/source-upload' },
    ],
  },
  {
    id: 'verify',
    icon: <BadgeCheck className="w-4 h-4" />,
    label: '품질 보증',
    labelEn: 'Verify',
    defaultOpen: false,
    items: [
      { icon: <CheckSquare className="w-4 h-4" />, label: 'HITL 검토', labelEn: 'HITL Review', path: '/hitl' },
      { icon: <GitCompareArrows className="w-4 h-4" />, label: '팩트 체크', labelEn: 'Fact Check', path: '/fact-check' },
      { icon: <ScanSearch className="w-4 h-4" />, label: 'Gap 분석', labelEn: 'Gap Analysis', path: '/gap-analysis' },
    ],
  },
  {
    id: 'deliver',
    icon: <Rocket className="w-4 h-4" />,
    label: '활용',
    labelEn: 'Deliver',
    defaultOpen: false,
    items: [
      { icon: <Package className="w-4 h-4" />, label: 'Skill 카탈로그', labelEn: 'Skill Catalog', path: '/skills' },
      { icon: <FileJson className="w-4 h-4" />, label: 'Spec 카탈로그', labelEn: 'Spec Catalog', path: '/specs' },
      { icon: <Plug className="w-4 h-4" />, label: 'API 연결', labelEn: 'API Console', path: '/api-console' },
    ],
  },
  {
    id: 'engineer',
    icon: <Code className="w-4 h-4" />,
    label: '엔지니어',
    labelEn: 'Engineer',
    defaultOpen: false,
    items: [
      { icon: <GitCompareArrows className="w-4 h-4" />, label: 'Workbench', labelEn: 'Workbench', path: '/engineer/workbench' },
    ],
  },
  {
    id: 'admin',
    icon: <Wrench className="w-4 h-4" />,
    label: '관리',
    labelEn: 'Admin',
    defaultOpen: false,
    items: [
      { icon: <Network className="w-4 h-4" />, label: '온톨로지', labelEn: 'Ontology', path: '/ontology' },
      { icon: <Settings className="w-4 h-4" />, label: '설정', labelEn: 'Settings', path: '/settings' },
      { icon: <MonitorPlay className="w-4 h-4" />, label: 'Working Mock-up', labelEn: 'Live Demo', path: '/mockup' },
      { icon: <Wrench className="w-4 h-4" />, label: 'Admin 대시보드', labelEn: 'Admin', path: '/admin' },
    ],
  },
];

function groupContainsPath(group: MenuGroup, pathname: string): boolean {
  return group.items.some((item) => item.path === pathname);
}

export const Sidebar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { organizationId, setOrganizationId } = useOrganization();
  const { user, logout } = useAuth();
  const { darkMode, toggleDarkMode } = useTheme();

  const userName = user?.displayName ?? user?.email ?? '게스트';
  const userRole = user?.role ?? '미인증';
  const isGuest = user?.role === 'guest';

  const handleLogout = () => {
    logout();
    navigate('/welcome');
  };

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const group of menuGroups) {
      initial[group.id] = group.defaultOpen ?? false;
    }
    return initial;
  });

  // Auto-expand group containing the active route
  useEffect(() => {
    for (const group of menuGroups) {
      if (groupContainsPath(group, location.pathname)) {
        setOpenGroups((prev) => ({ ...prev, [group.id]: true }));
      }
    }
  }, [location.pathname]);

  const toggleGroup = (groupId: string) => {
    setOpenGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <aside
      className="w-60 h-screen flex flex-col border-r"
      style={{ backgroundColor: 'var(--primary)', borderColor: 'rgba(255, 255, 255, 0.1)' }}
    >
      {/* Logo */}
      <div className="p-5 pb-3 border-b" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
        <Link to="/" className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shadow-lg"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <span className="text-lg font-bold" style={{ color: 'var(--accent-foreground)' }}>
              AI
            </span>
          </div>
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--primary-foreground)' }}>
              AI Foundry
            </h1>
            <p className="text-[10px]" style={{ color: 'rgba(255, 255, 255, 0.5)' }}>
              Knowledge Reverse Engineering
            </p>
          </div>
        </Link>
      </div>

      {/* Organization Selector */}
      <div className="px-3 pt-3 pb-1">
        <div className="flex items-center gap-2 mb-1.5 px-1">
          <Building2 className="w-3.5 h-3.5" style={{ color: 'rgba(255, 255, 255, 0.5)' }} />
          <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'rgba(255, 255, 255, 0.5)' }}>
            Organization
          </span>
        </div>
        <Select value={organizationId} onValueChange={setOrganizationId}>
          <SelectTrigger
            className="w-full border-white/20 text-sm h-8"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              color: 'var(--primary-foreground)',
            }}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ORGANIZATIONS.map((org) => (
              <SelectItem key={org.id} value={org.id}>
                <div>
                  <div className="text-sm">{org.label}</div>
                  <div className="text-xs text-muted-foreground">{org.labelEn}</div>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 pt-2 pb-3 overflow-auto">
        {/* Dashboard — standalone */}
        <Link
          to="/"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 transition-all duration-200"
          style={{
            backgroundColor: isActive('/') ? 'var(--accent)' : 'transparent',
            color: isActive('/') ? 'var(--accent-foreground)' : 'var(--primary-foreground)',
            boxShadow: isActive('/') ? '0 2px 8px rgba(246, 173, 85, 0.3)' : 'none',
          }}
        >
          <LayoutDashboard className="w-4 h-4" style={{ color: isActive('/') ? 'var(--accent-foreground)' : 'rgba(255, 255, 255, 0.8)' }} />
          <div className="flex-1">
            <div className="text-sm font-medium">대시보드</div>
            <div className="text-[10px]" style={{ color: isActive('/') ? 'var(--accent-foreground)' : 'rgba(255, 255, 255, 0.45)' }}>
              Dashboard
            </div>
          </div>
        </Link>

        {/* Grouped Menus */}
        <div className="space-y-0.5 mt-1">
          {menuGroups.map((group) => {
            const isOpen = openGroups[group.id] ?? false;
            const hasActiveChild = groupContainsPath(group, location.pathname);

            return (
              <div key={group.id}>
                {/* Group Header */}
                <button
                  onClick={() => toggleGroup(group.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 hover:bg-white/5"
                  style={{ color: 'var(--primary-foreground)' }}
                >
                  <span style={{ color: hasActiveChild ? 'var(--accent)' : 'rgba(255, 255, 255, 0.6)' }}>
                    {group.icon}
                  </span>
                  <div className="flex-1 text-left">
                    <span className="text-xs font-semibold tracking-wide">{group.label}</span>
                    {' '}
                    <span
                      className="text-[10px] ml-1.5"
                      style={{ color: 'rgba(255, 255, 255, 0.4)' }}
                    >
                      {group.labelEn}
                    </span>
                  </div>
                  {hasActiveChild && (
                    <span
                      className="w-1.5 h-1.5 rounded-full mr-1"
                      style={{ backgroundColor: 'var(--accent)' }}
                    />
                  )}
                  <ChevronDown
                    className="w-3.5 h-3.5 transition-transform duration-200"
                    style={{
                      color: 'rgba(255, 255, 255, 0.4)',
                      transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                    }}
                  />
                </button>

                {/* Group Items */}
                <div
                  className="overflow-hidden transition-all duration-200"
                  style={{
                    maxHeight: isOpen ? `${group.items.length * 52}px` : '0px',
                    opacity: isOpen ? 1 : 0,
                  }}
                >
                  {group.items.map((item) => {
                    const active = isActive(item.path);
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        className="flex items-center gap-2.5 pl-9 pr-3 py-1.5 rounded-md transition-all duration-150 ml-1"
                        style={{
                          backgroundColor: active ? 'var(--accent)' : 'transparent',
                          color: active ? 'var(--accent-foreground)' : 'var(--primary-foreground)',
                          boxShadow: active ? '0 1px 4px rgba(246, 173, 85, 0.25)' : 'none',
                        }}
                      >
                        <span style={{ color: active ? 'var(--accent-foreground)' : 'rgba(255, 255, 255, 0.65)' }}>
                          {item.icon}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-medium truncate">{item.label}</div>
                          <div
                            className="text-[10px] truncate"
                            style={{ color: active ? 'var(--accent-foreground)' : 'rgba(255, 255, 255, 0.35)' }}
                          >
                            {item.labelEn}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Guide — standalone, bottom of nav */}
        <div className="mt-2 pt-2 border-t" style={{ borderColor: 'rgba(255, 255, 255, 0.08)' }}>
          <Link
            to="/guide"
            className="flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 hover:bg-white/5"
            style={{
              backgroundColor: isActive('/guide') ? 'var(--accent)' : 'transparent',
              color: isActive('/guide') ? 'var(--accent-foreground)' : 'var(--primary-foreground)',
            }}
          >
            <BookOpen className="w-4 h-4" style={{ color: isActive('/guide') ? 'var(--accent-foreground)' : 'rgba(255, 255, 255, 0.6)' }} />
            <div className="text-sm font-medium">이용 가이드</div>
          </Link>
        </div>
      </nav>

      {/* User Profile */}
      <div className="p-3 border-t" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
        {/* F384: Guest Demo Mode 배지 + 로그인 CTA */}
        {isGuest && (
          <div className="mb-2 px-2 py-1.5 rounded-lg" style={{ backgroundColor: 'rgba(246, 173, 85, 0.12)', border: '1px solid rgba(246, 173, 85, 0.3)' }}>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-xs">🎭</span>
              <span className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>Demo Mode</span>
            </div>
            <Link
              to="/welcome"
              className="flex items-center gap-1 text-[11px] transition-opacity hover:opacity-80"
              style={{ color: 'rgba(255, 255, 255, 0.7)' }}
            >
              <LogIn className="w-3 h-3" />
              <span>로그인하기</span>
            </Link>
          </div>
        )}
        <div
          className="flex items-center gap-2.5 p-2.5 rounded-lg transition-all duration-200 hover:bg-white/5"
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}
        >
          <Avatar className="w-8 h-8">
            <AvatarFallback style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}>
              <User className="w-4 h-4" />
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate" style={{ color: 'var(--primary-foreground)' }}>
              {userName}
            </div>
            <Badge
              className="mt-0.5 text-[10px] px-1.5 py-0"
              style={{
                backgroundColor: isGuest ? 'rgba(246, 173, 85, 0.1)' : 'rgba(246, 173, 85, 0.2)',
                color: 'var(--accent)',
                border: '1px solid var(--accent)',
              }}
            >
              {isGuest ? '🎭 Demo' : userRole}
            </Badge>
          </div>
          {!isGuest && (
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-md transition-colors hover:bg-white/10"
              title="로그아웃"
            >
              <LogOut className="w-3.5 h-3.5" style={{ color: 'rgba(255, 255, 255, 0.5)' }} />
            </button>
          )}
        </div>
      </div>

      {/* Theme Toggle */}
      <div className="px-3 pb-3">
        <button
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 hover:bg-white/5"
          style={{ backgroundColor: 'transparent', color: 'var(--primary-foreground)' }}
          onClick={toggleDarkMode}
        >
          <span style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
            {darkMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </span>
          <div className="text-xs">{darkMode ? 'Dark' : 'Light'}</div>
        </button>
      </div>
    </aside>
  );
};
