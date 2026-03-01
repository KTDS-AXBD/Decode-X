import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { User, Bell, Lock, Palette, Database, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '@/contexts/ThemeContext';

export default function SettingsPage() {
  const { darkMode, setDarkMode } = useTheme();
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [slackNotifications, setSlackNotifications] = useState(false);
  const [twoFactorAuth, setTwoFactorAuth] = useState(true);
  const [language, setLanguage] = useState('ko');

  const handleSave = () => toast.success('설정이 저장되었습니다');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          설정 Settings
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          시스템 환경 설정 및 개인화
        </p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList>
          <TabsTrigger value="profile"><User className="w-4 h-4 mr-2" />프로필</TabsTrigger>
          <TabsTrigger value="notifications"><Bell className="w-4 h-4 mr-2" />알림</TabsTrigger>
          <TabsTrigger value="security"><Lock className="w-4 h-4 mr-2" />보안</TabsTrigger>
          <TabsTrigger value="appearance"><Palette className="w-4 h-4 mr-2" />모양</TabsTrigger>
          <TabsTrigger value="system"><Database className="w-4 h-4 mr-2" />시스템</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader><CardTitle>사용자 정보 User Information</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">이름 Name</Label>
                  <Input id="name" defaultValue="관리자" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">역할 Role</Label>
                  <Input id="role" defaultValue="시스템 관리자" disabled />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">이메일 Email</Label>
                <Input id="email" type="email" defaultValue="admin@aifoundry.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="department">부서 Department</Label>
                <Select defaultValue="it">
                  <SelectTrigger id="department"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="it">IT 운영팀</SelectItem>
                    <SelectItem value="dev">개발팀</SelectItem>
                    <SelectItem value="domain">도메인 전문가</SelectItem>
                    <SelectItem value="qa">품질 관리팀</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleSave}><Save className="w-4 h-4 mr-2" />변경사항 저장</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader><CardTitle>알림 설정 Notification Settings</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium" style={{ color: 'var(--text-primary)' }}>이메일 알림</div>
                  <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>중요 이벤트 발생 시 이메일로 알림을 받습니다</div>
                </div>
                <Switch checked={emailNotifications} onCheckedChange={setEmailNotifications} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium" style={{ color: 'var(--text-primary)' }}>Slack 알림</div>
                  <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Slack 채널로 실시간 알림을 받습니다</div>
                </div>
                <Switch checked={slackNotifications} onCheckedChange={setSlackNotifications} />
              </div>
              <div className="pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                <h4 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>알림 유형</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="notif-policy">정책 검토 요청</Label>
                    <Switch id="notif-policy" defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="notif-error">시스템 오류</Label>
                    <Switch id="notif-error" defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="notif-deploy">Skill 배포 완료</Label>
                    <Switch id="notif-deploy" defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="notif-trust">신뢰도 경고</Label>
                    <Switch id="notif-trust" defaultChecked />
                  </div>
                </div>
              </div>
              <Button onClick={handleSave}><Save className="w-4 h-4 mr-2" />변경사항 저장</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader><CardTitle>보안 설정 Security Settings</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium" style={{ color: 'var(--text-primary)' }}>2단계 인증 (2FA)</div>
                  <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>로그인 시 추가 인증 단계를 거칩니다</div>
                </div>
                <Switch checked={twoFactorAuth} onCheckedChange={setTwoFactorAuth} />
              </div>
              <div className="pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                <h4 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>비밀번호 변경</h4>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="current-password">현재 비밀번호</Label>
                    <Input id="current-password" type="password" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-password">새 비밀번호</Label>
                    <Input id="new-password" type="password" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">비밀번호 확인</Label>
                    <Input id="confirm-password" type="password" />
                  </div>
                  <Button variant="outline">비밀번호 변경</Button>
                </div>
              </div>
              <div className="pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                <h4 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>세션 관리</h4>
                <div className="p-4 rounded-lg mb-3" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>현재 세션</div>
                    <div className="text-xs text-green-600">● 활성</div>
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>IP: 10.0.1.45 • 위치: Seoul, Korea</div>
                  <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>마지막 활동: 방금 전</div>
                </div>
                <Button variant="destructive" size="sm">모든 세션 종료</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appearance" className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader><CardTitle>모양 설정 Appearance Settings</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="language">언어 Language</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger id="language"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ko">한국어 (Korean)</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="ja">日本語 (Japanese)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium" style={{ color: 'var(--text-primary)' }}>다크 모드</div>
                  <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>어두운 테마를 사용합니다</div>
                </div>
                <Switch checked={darkMode} onCheckedChange={setDarkMode} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="density">화면 밀도</Label>
                <Select defaultValue="comfortable">
                  <SelectTrigger id="density"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compact">컴팩트</SelectItem>
                    <SelectItem value="comfortable">편안함</SelectItem>
                    <SelectItem value="spacious">여유있게</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleSave}><Save className="w-4 h-4 mr-2" />변경사항 저장</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="system" className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader><CardTitle>시스템 설정 System Settings</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="api-endpoint">API Endpoint</Label>
                <Input id="api-endpoint" defaultValue="https://api.aifoundry.com/v1" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max-concurrent">최대 동시 실행 Skill</Label>
                <Input id="max-concurrent" type="number" defaultValue="10" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timeout">요청 타임아웃 (초)</Label>
                <Input id="timeout" type="number" defaultValue="30" />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium" style={{ color: 'var(--text-primary)' }}>자동 백업</div>
                  <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>매일 자동으로 데이터를 백업합니다</div>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium" style={{ color: 'var(--text-primary)' }}>상세 로깅</div>
                  <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>모든 API 호출 및 이벤트를 기록합니다</div>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                <h4 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>위험한 작업</h4>
                <div className="space-y-3">
                  <Button variant="outline" className="w-full"><Database className="w-4 h-4 mr-2" />데이터베이스 백업</Button>
                  <Button variant="outline" className="w-full">캐시 초기화</Button>
                  <Button variant="destructive" className="w-full">시스템 초기화</Button>
                </div>
              </div>
              <Button onClick={handleSave}><Save className="w-4 h-4 mr-2" />변경사항 저장</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
