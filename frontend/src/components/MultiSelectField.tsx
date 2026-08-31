import { Autocomplete, Box, Checkbox, Chip, TextField, Typography } from '@mui/material';

export type MultiSelectOption = {
  id: number | string;
  label: string;
  detail?: string;
};

type MultiSelectFieldProps = {
  label: string;
  options: MultiSelectOption[];
  value: Array<number | string>;
  onChange: (ids: Array<number | string>) => void;
  helperText?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
};

export function MultiSelectField({ label, options, value, onChange, helperText, placeholder, disabled = false, required = false }: MultiSelectFieldProps) {
  const selected = options.filter(option => value.includes(option.id));
  const selectionHelp = selected.length ? `${selected.length} selected${helperText ? ` · ${helperText}` : ''}` : helperText;

  return <Autocomplete
    multiple
    disableCloseOnSelect
    disabled={disabled}
    options={options}
    value={selected}
    isOptionEqualToValue={(option, current) => option.id === current.id}
    getOptionLabel={option => option.label}
    onChange={(_, next) => onChange(next.map(option => option.id))}
    renderTags={(tagValue, getTagProps) => <>
      {tagValue.slice(0, 2).map((option, index) => <Chip {...getTagProps({ index })} key={option.id} label={option.label} size="small" />)}
      {tagValue.length > 2 && <Chip label={`+${tagValue.length - 2} more`} size="small" variant="outlined" />}
    </>}
    renderOption={(props, option, state) => <Box component="li" {...props} key={option.id} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', py: 1 }}>
      <Checkbox checked={state.selected} size="small" sx={{ p: .25, mt: .1 }} />
      <Box sx={{ minWidth: 0 }}><Typography variant="body2" fontWeight={650}>{option.label}</Typography>{option.detail && <Typography variant="caption" color="text.secondary">{option.detail}</Typography>}</Box>
    </Box>}
    renderInput={params => <TextField {...params} label={label} required={required} helperText={selectionHelp} placeholder={selected.length ? '' : placeholder ?? `Search and select ${label.toLowerCase()}`} />}
    slotProps={{ paper: { sx: { mt: .5 } }, listbox: { sx: { maxHeight: 320 } } }}
    sx={{ '& .MuiAutocomplete-inputRoot': { alignItems: 'center', minHeight: 56 } }}
  />;
}
