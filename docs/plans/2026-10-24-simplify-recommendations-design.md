# Simplify nutrition inputs and saving

The main page treats new nutrition inputs as targets for one dish. It removes the scope selector and individual save buttons. Existing daily targets require an explicit review checkbox before conversion, or the user can clear them. The backend retains its existing scope support for compatibility.

Save and recommend validates all four preference panels, saves their current values, and only then calls the recommendation endpoint. Components expose validation and save methods; the parent coordinates them. Fields are disabled during the operation. Loading, validation, or save failures stop the recommendation and leave an actionable message. Separate save requests can partially succeed; retry saves the full form again.

Integration checks cover current unsaved edits across panels, automatic per-serving scope, validation before writes, legacy review, clearing targets as a draft, load failures, and save failures. No backend migration is needed.
