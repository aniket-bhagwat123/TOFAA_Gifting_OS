/** A red asterisk after a label: this field has to be filled in. Fields without it can be left empty. */
export function RequiredMark() {
  return <span className="ml-0.5 text-rose-600" aria-hidden="true">*</span>;
}
