import { WorkspacePlaceholder } from '../components/WorkspacePlaceholder';

export function AiControlPage() {
  return (
    <WorkspacePlaceholder
      title="ควบคุม AI"
      description="AI ช่วยสรุปเคส จัดลำดับความสำคัญ และแนะนำการกระทำ — ไม่ได้ตัดสินแทนแอดมิน คำแนะนำจริงอยู่ที่ศูนย์จัดการเคส"
      ctaLabel="ไปที่ศูนย์จัดการเคส"
      ctaTo="/safety/cases"
      helpKey="ai"
    />
  );
}
