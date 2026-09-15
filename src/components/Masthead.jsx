export default function Masthead() {
  return (
    <header>
      <div className="masthead">
        <div className="shell masthead__inner">
          <img
            className="masthead__emblem"
            src="/brand/eagle.png"
            alt="شعار الجمهورية العربية السورية"
          />
          <div className="masthead__titles">
            <span className="masthead__title">منصة مديرية التخطيط والإحصاء</span>
            <span className="masthead__parent">وزارة الطوارئ وإدارة الكوارث</span>
          </div>
        </div>
      </div>
      <div className="brand-band" aria-hidden="true" />
    </header>
  );
}
