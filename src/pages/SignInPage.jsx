import { useEffect, useRef, useState } from "react";
import { LanguageToggle } from "../components/LanguageToggle";
import { AuthBrand, AuthCover } from "../components/AuthCover";
import { AuthForm } from "../components/AuthForm";
import { useLanguage } from "../i18n/LanguageContext";

export function SignInPage(props) {
  const { language } = useLanguage();
  const pageRef = useRef(null);
  const [hasEntered, setHasEntered] = useState(false);
  useEffect(() => {
    let active = true;
    const entrances = pageRef.current.getAnimations({ subtree: true })
      .filter((animation) => ["auth-rise", "auth-sheet-in"].includes(animation.animationName))
      .map((animation) => animation.finished);
    Promise.allSettled(entrances).then(() => {
      if (active) setHasEntered(true);
    });
    return () => { active = false; };
  }, []);
  return (
    <main ref={pageRef} className={`auth-page${hasEntered ? " has-entered" : ""}`} lang={language === "zh" ? "zh-CN" : "en"}>
      <header className="auth-mobile-header"><AuthBrand compact /><LanguageToggle /></header>
      <AuthCover />
      <section className="auth-sheet">
        <div className="auth-sheet-language"><LanguageToggle /></div>
        <div className="auth-form-position"><AuthForm {...props} /></div>
        <span className="auth-folio" aria-hidden="true">— i —</span>
      </section>
    </main>
  );
}
