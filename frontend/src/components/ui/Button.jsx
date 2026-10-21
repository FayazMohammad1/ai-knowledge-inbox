export function Button({ variant = 'primary', className = '', ...props }) {
  const styles = {
    primary: 'bg-[#6101fe] text-white hover:bg-[#4f00d4]',
    outline: 'border border-[#e8e6eb] bg-white text-[#515051] hover:border-[#6101fe] hover:text-[#6101fe]',
    ghost: 'text-[#515051] hover:bg-[#f1eaff] hover:text-[#6101fe]',
    danger: 'border border-[#f3c7c3] bg-white text-[#b42318] hover:bg-[#fef3f2]',
  };
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6101fe] disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
    />
  );
}
