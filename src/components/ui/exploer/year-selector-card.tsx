import { Typography } from '@/constants/typography';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Card } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import type { YearRecord } from '@/database/types';
import { useTheme } from '@/hooks/use-theme';

interface YearSelectorCardProps {
  selectedYear: YearRecord | null;
  years: YearRecord[];
  visible: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSelectYear: (year: YearRecord) => void;
  formatYear: (value: number | string | null | undefined) => string;
}

export function YearSelectorCard({
  selectedYear,
  years,
  visible,
  onOpen,
  onClose,
  onSelectYear,
  formatYear,
}: YearSelectorCardProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { marginBottom: Spacing.four }]}>
      <Card elevation={1} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Card.Content style={styles.cardContent}>
          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <ThemedText type="bodyBold" style={[styles.pageTitle, { color: theme.text }]}>
                انتخاب سال کارکرد
              </ThemedText>
              <ThemedText type="small" style={[styles.pageDescription, { color: theme.textSecondary }]}>
                سال موردنظر را برای مشاهده اطلاعات جامع مزدی انتخاب کنید.
              </ThemedText>
            </View>
          </View>

          <View style={styles.metricsRow}>
            <View style={[styles.metricBox, { backgroundColor: theme.surfaceVariant }]}>
              <ThemedText type="small" style={[styles.sectionLabel, { color: theme.textSecondary }]}>
                سال کارکرد فعلی
              </ThemedText>
              <View style={styles.metricContent}>
                <MaterialCommunityIcons name="calendar-month-outline" size={20} color={theme.primaryText} />
                <ThemedText type="bodyBold" style={[styles.fieldValue, { color: theme.text }]}>
                  {selectedYear ? formatYear(selectedYear.year) : 'انتخاب سال'}
                </ThemedText>
              </View>
            </View>

            <View style={[styles.metricBox, { backgroundColor: theme.surfaceVariant }]}>
              <ThemedText type="small" style={[styles.sectionLabel, { color: theme.textSecondary }]}>
                تعداد دوره‌ها
              </ThemedText>
              <View style={styles.metricContent}>
                <MaterialCommunityIcons name="calendar-multiple" size={20} color={theme.primaryText} />
                <ThemedText type="bodyBold" style={[styles.fieldValue, { color: theme.text }]}>
                  {selectedYear ? `${selectedYear.period_count?.toLocaleString('fa-IR') ?? '-'} دوره` : '-'}
                </ThemedText>
              </View>
            </View>
          </View>

          <Pressable
            onPress={onOpen}
            style={({ pressed }) => [
              styles.actionButton,
              {
                backgroundColor: pressed ? theme.primary : theme.primary,
              },
            ]}
          >
            {({ pressed }) => (
              <>
                <MaterialCommunityIcons
                  name="calendar-month-outline"
                  size={18}
                  color={theme.onPrimary}
                />
                <ThemedText style={[styles.buttonLabel, { color: theme.onPrimary }]}>
                  انتخاب سال
                </ThemedText>
              </>
            )}
          </Pressable>
        </Card.Content>
      </Card>

      <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
        <Pressable style={[styles.yearPickerOverlay, { backgroundColor: theme.overlay }]} onPress={onClose}>
          <Pressable style={[styles.yearPickerModal, { backgroundColor: theme.surfaceElevated, paddingBottom: Spacing.three + insets.bottom }]}>
            <View style={[styles.yearPickerHandle, { backgroundColor: theme.borderStrong }]} />
            <View style={styles.yearPickerHeader}>
              <View style={styles.yearPickerHeaderTextBlock}>
                <ThemedText type="smallBold" style={styles.yearPickerTitle}>انتخاب سال</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">سال موردنظر را انتخاب کنید</ThemedText>
              </View>
              <Pressable onPress={onClose}>
                <MaterialCommunityIcons name="close" size={20} color={theme.textSecondary} />
              </Pressable>
            </View>

            <ScrollView style={styles.yearPickerList} showsVerticalScrollIndicator={false} contentContainerStyle={styles.yearPickerListContent}>
              {[...years].sort((a, b) => b.year - a.year).map(year => {
                const isSelected = selectedYear?.id === year.id;
                return (
                  <Pressable
                    key={year.id}
                    onPress={() => {
                      onClose();
                      onSelectYear(year);
                    }}
                    style={[
                      styles.yearPickerItem,
                      {
                        backgroundColor: isSelected ? theme.primary : theme.surface,
                        borderColor: isSelected ? theme.primary : theme.border,
                      },
                    ]}
                  >
                    <View style={styles.yearPickerItemContent}>
                      <ThemedText
                        type="labelBold"
                        style={{ color: isSelected ? theme.onPrimary : theme.text }}
                      >
                        {formatYear(year.year)}
                      </ThemedText>
                      {isSelected ? (
                        <MaterialCommunityIcons name="check-circle" size={18} color={theme.onPrimary} />
                      ) : (
                        <MaterialCommunityIcons name="circle-outline" size={18} color={theme.textSecondary} />
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  card: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  cardContent: {
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  headerRow: {
    alignItems: 'flex-start',
  },
  headerText: {
    flex: 1,
    gap: Spacing.one,
  },
  pageTitle: {
    fontFamily: 'AppFont-Bold',
    fontSize: Typography.fontSize.bodyLarge,
    lineHeight: Typography.lineHeight.label,
  },
  pageDescription: {
    fontFamily: 'AppFont-Regular',
    fontSize: Typography.fontSize.footnote,
    lineHeight: Typography.lineHeight.caption,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  metricBox: {
    flex: 1,
    borderRadius: 14,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    gap: Spacing.one,
  },
  sectionLabel: {
    fontSize: Typography.fontSize.footnote,
    lineHeight: Typography.lineHeight.caption,
    fontFamily: 'AppFont-Medium',
  },
  metricContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  fieldValue: {
    fontFamily: 'AppFont-Bold',
    fontSize: Typography.fontSize.compact,
    lineHeight: Typography.lineHeight.bodyCompact,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  buttonLabel: {
    fontFamily: 'AppFont-Bold',
    fontSize: Typography.fontSize.compact,
    lineHeight: Typography.lineHeight.bodyCompact,
  },
  yearPickerOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  yearPickerModal: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingBottom: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
  },
  yearPickerHandle: {
    width: 72,
    height: 5,
    borderRadius: 999,
    alignSelf: 'center',
    marginBottom: Spacing.three,
  },
  yearPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  yearPickerHeaderTextBlock: {
    gap: 4,
    flex: 1,
  },
  yearPickerTitle: {
    fontSize: Typography.fontSize.bodyLarge,
    fontWeight: '600',
  },
  yearPickerList: {
    maxHeight: 280,
  },
  yearPickerListContent: {
    gap: Spacing.two,
  },
  yearPickerItem: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  yearPickerItemContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
